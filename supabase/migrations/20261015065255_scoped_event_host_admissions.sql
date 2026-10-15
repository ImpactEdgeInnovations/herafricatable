begin;
-- Event Hosts can review only free places in their own active event. No
-- payment, refund, guest-email or platform Admin permissions are widened.
create function public.list_host_event_requests(p_event_id uuid)
returns table(order_id uuid,display_name text,requested_at timestamptz,attendee_note text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_host_event(p_event_id) then raise exception 'Event Host access required'; end if;
  return query select o.id,p.display_name::text,r.created_at,r.attendee_note::text
  from public.orders o join public.registration_requests r on r.order_id=o.id join public.profiles p on p.id=o.user_id
  join public.manual_payment_reviews review on review.order_id=o.id
  where o.event_id=p_event_id and o.order_type='event' and o.total_minor=0 and o.processing_mode='manual_review'
    and o.status='pending_review' and r.status='pending_review' and review.status='pending'
  order by r.created_at,o.id limit 100;
end; $$;

create function public.review_host_event_request(p_order_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found or auth.uid() is null or not public.can_host_event(o.event_id) then raise exception 'Event Host access required'; end if;
  if o.order_type<>'event' or o.total_minor<>0 or o.processing_mode<>'manual_review' or o.status<>'pending_review' then raise exception 'Only pending free places can be reviewed here'; end if;
  if p_action not in ('approve','reject') then raise exception 'Choose Approve or Decline'; end if;
  if p_action='reject' and char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Add a short reason of 5 to 500 characters'; end if;
  if not exists(select 1 from public.events where id=o.event_id and status='published' and ends_at>now()) then raise exception 'This event is not open'; end if;
  update public.manual_payment_reviews set status=case when p_action='approve' then 'approved' else 'rejected' end,reviewer_id=auth.uid(),reviewer_note=case when p_action='reject' then trim(p_reason) end,reviewed_at=now(),updated_at=now() where order_id=o.id and status='pending';
  if not found then raise exception 'This request has already changed. Refresh the list'; end if;
  update public.orders set status=case when p_action='approve' then 'approved' else 'cancelled' end,updated_at=now() where id=o.id;
  if p_action='approve' then perform public.fulfill_registration_order(o.id,'host_free_place_review');
  else update public.registration_requests set status='rejected',updated_at=now() where order_id=o.id; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'registration.host_'||p_action,'order',o.id,jsonb_build_object('event_id',o.event_id));
end; $$;

create function public.list_host_event_waiting_members(p_event_id uuid)
returns table(request_id uuid,display_name text,joined_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_host_event(p_event_id) then raise exception 'Event Host access required'; end if;
  return query select r.id,p.display_name::text,r.created_at from public.registration_requests r join public.profiles p on p.id=r.user_id where r.event_id=p_event_id and r.status='waitlisted' order by r.created_at,r.id limit 100;
end; $$;

create function public.notify_host_waitlisted_guest(p_event_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; r public.registration_requests%rowtype; reserved bigint;
begin
  if auth.uid() is null or not public.can_host_event(p_event_id) then raise exception 'Event Host access required'; end if;
  select * into e from public.events where id=p_event_id and status='published' and ends_at>now() and registration_mode in ('manual_review','automatic');
  if not found then raise exception 'Reopen bookings before sending a place notice'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(e.id::text,0::bigint));
  select coalesce(sum(i.quantity),0) into reserved from public.order_items i join public.orders o on o.id=i.order_id where o.event_id=e.id and o.status not in ('cancelled','expired','refunded');
  if e.capacity is not null and reserved>=e.capacity then raise exception 'This event is still full'; end if;
  if not exists(select 1 from public.ticket_types t where t.event_id=e.id and t.status='on_sale' and t.price_minor=0 and (t.sales_start_at is null or t.sales_start_at<=now()) and (t.sales_end_at is null or t.sales_end_at>now()) and (t.inventory_quantity is null or t.inventory_quantity>(select coalesce(sum(i.quantity),0) from public.order_items i join public.orders o on o.id=i.order_id where i.ticket_type_id=t.id and o.status not in ('cancelled','expired','refunded')))) then raise exception 'No free places are available to request'; end if;
  select * into r from public.registration_requests where id=p_request_id and event_id=e.id and status='waitlisted' for update;
  if not found then raise exception 'This waiting-list entry has changed'; end if;
  perform public.enqueue_notification(r.user_id,'event','A place may be available at '||e.title,'Bookings have reopened. Open the event to request a place. Your waiting-list entry does not hold a seat.','/events/'||e.slug,'event-waitlist-open:'||r.id||':'||r.updated_at);
end; $$;

create or replace function public.notify_event_registration_review() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record; e public.events%rowtype; reference text; reason text; is_free boolean;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status and old.order_id is not distinct from new.order_id then return new; end if;
  select * into e from public.events where id=new.event_id;
  select o.reference,o.total_minor=0 into reference,is_free from public.orders o where o.id=new.order_id;
  if new.status='pending_review' and new.order_id is not null then
    for recipient in
      select distinct r.user_id as id,false as host from public.user_roles r join public.profiles p on p.id=r.user_id where r.role='super_admin' and p.access_status='active'
      union select h.user_id,true from public.event_hosts h join public.profiles p on p.id=h.user_id where h.event_id=e.id and h.status='active' and p.access_status='active'
    loop
      if recipient.id=new.user_id then continue; end if;
      perform public.enqueue_notification(recipient.id,'registration','New request for '||e.title,
        case when recipient.host and is_free then 'A guest requested a free place. Review the request in your event tools.' when recipient.host then 'A guest requested a place. The platform team will review payment and confirm the booking.' else 'A guest requested a place. Review it in Events → Registrations.' end,
        case when recipient.host then '/events/'||e.slug||'/host#guest-requests' else '/admin/events?view=registrations' end,
        'event-registration-review:'||new.order_id||':'||recipient.id);
    end loop;
  elsif new.status='waitlisted' then
    for recipient in select h.user_id as id from public.event_hosts h join public.profiles p on p.id=h.user_id where h.event_id=e.id and h.status='active' and p.access_status='active' and h.user_id<>new.user_id loop
      perform public.enqueue_notification(recipient.id,'event','New waiting-list entry for '||e.title,'A member is waiting for a place. No seat is reserved.','/events/'||e.slug||'/host#guest-requests','event-host-waitlist:'||new.id||':'||new.updated_at);
    end loop;
    perform public.enqueue_notification(new.user_id,'registration','You are on the waiting list','No place is reserved. The event team will let you know if bookings reopen.','/events/'||e.slug,'event-waitlist-confirmation:'||new.id||':'||new.updated_at);
  elsif new.status='rejected' and new.order_id is not null then
    select reviewer_note into reason from public.manual_payment_reviews where order_id=new.order_id and status='rejected';
    perform public.enqueue_notification(new.user_id,'registration','Your event request was declined','Your request for '||e.title||' was not approved.'||case when nullif(trim(reason),'') is not null then ' '||left(trim(reason),500) else ' Contact the event team if you need help.' end,
      case when reference is null then '/events' else '/orders/'||reference end,'event-registration-declined:'||new.order_id);
  end if;
  return new;
end; $$;
revoke all on function public.notify_event_registration_review() from public,anon,authenticated;

create function public.join_full_event_waitlist(p_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; reserved bigint; previous text; host record;
begin
  if auth.uid() is null or not public.is_active_member(auth.uid()) then raise exception 'Active membership required'; end if;
  select * into e from public.events where id=p_event_id and status='published' and ends_at>now();
  if not found or not public.can_view_event(e.id,auth.uid()) or e.registration_mode='closed' then raise exception 'This event is not open to requests'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(e.id::text,0::bigint));
  select coalesce(sum(i.quantity),0) into reserved from public.order_items i join public.orders o on o.id=i.order_id where o.event_id=e.id and o.order_type='event' and o.status not in ('cancelled','expired','refunded');
  if e.registration_mode<>'waitlist' and (e.capacity is null or reserved<e.capacity) then raise exception 'Places may still be available. Refresh the event to check'; end if;
  select status into previous from public.registration_requests where event_id=e.id and user_id=auth.uid() for update;
  if previous='waitlisted' then return; end if;
  if previous is not null and previous<>'cancelled' then raise exception 'You already have an event request or decision'; end if;
  insert into public.registration_requests(event_id,user_id,status) values(e.id,auth.uid(),'waitlisted') on conflict(event_id,user_id) do update set status='waitlisted',order_id=null,updated_at=now() where public.registration_requests.status='cancelled';
end; $$;

do $$ declare signature text; begin foreach signature in array array['list_host_event_requests(uuid)','review_host_event_request(uuid,text,text)','join_full_event_waitlist(uuid)','list_host_event_waiting_members(uuid)','notify_host_waitlisted_guest(uuid,uuid)']
loop execute 'revoke all on function public.'||signature||' from public,anon';execute 'grant execute on function public.'||signature||' to authenticated';end loop;end $$;
notify pgrst,'reload schema';
commit;
