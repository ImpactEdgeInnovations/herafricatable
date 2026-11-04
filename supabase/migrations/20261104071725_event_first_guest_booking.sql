begin;
-- Applied to live project gtzwqromwvzqytygebfc as 20261104071725.

-- Event-only identity and booking consent; not a membership application.
create table hat_event_ops.guest_details (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check(char_length(trim(display_name)) between 2 and 120),
  agreed_at timestamptz not null default now(),
  terms_version text not null default 'event-booking-2026-11-04',
  primary key(event_id,user_id)
);
alter table hat_event_ops.guest_details enable row level security;
revoke all on hat_event_ops.guest_details from public,anon,authenticated;

create function public.get_my_event_guest_details(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Confirm your email first'; end if;
  return (select jsonb_build_object('display_name',d.display_name,'ready',true)
    from hat_event_ops.guest_details d join public.profiles p on p.id=d.user_id
    where d.event_id=p_event_id and d.user_id=auth.uid() and p.access_status in ('active','pending'));
end; $$;

create function public.save_my_event_guest_details(p_event_id uuid,p_display_name text,p_agreed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text:=trim(coalesce(p_display_name,'')); account_status text;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirm your email first'; end if;
  select access_status::text into account_status from public.profiles where id=actor for update;
  if account_status is null or account_status not in ('active','pending') then raise exception 'This account cannot make a new guest booking'; end if;
  if p_agreed is not true or char_length(clean) not between 2 and 120 then raise exception 'Add your name and accept the event booking terms'; end if;
  if not coalesce((select enabled from public.feature_flags where key='event_guest_access'),false)
    or not exists(select 1 from public.events where id=p_event_id and status='published' and audience='public' and ends_at>now() and registration_mode<>'closed') then
    raise exception 'Guest booking is not open for this event'; end if;
  insert into hat_event_ops.guest_details(event_id,user_id,display_name) values(p_event_id,actor,clean)
    on conflict(event_id,user_id) do update set display_name=excluded.display_name,agreed_at=now();
  -- A useful name on the guest list, without changing access, roles, onboarding
  -- or the founding pilot cohort. Existing members keep their profile name.
  update public.profiles set display_name=clean where id=actor and access_status='pending';
end; $$;
revoke all on function public.get_my_event_guest_details(uuid),public.save_my_event_guest_details(uuid,text,boolean) from public,anon;
grant execute on function public.get_my_event_guest_details(uuid),public.save_my_event_guest_details(uuid,text,boolean) to authenticated;

create or replace function public.create_event_registration(
  p_event_id uuid,p_ticket_type_id uuid,p_quantity integer,p_attendee_note text,p_manual_reference text,p_manual_note text
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirm your email first'; end if;
  if not exists(select 1 from public.events where id=p_event_id and status='published' and ends_at>now()) then raise exception 'This event is over or no longer open for registration'; end if;
  if not public.is_active_member(auth.uid()) and not exists(select 1 from hat_event_ops.guest_details where event_id=p_event_id and user_id=auth.uid()) then raise exception 'Complete your event booking details first'; end if;
  return public.create_event_registration_core(p_event_id,p_ticket_type_id,p_quantity,p_attendee_note,p_manual_reference,p_manual_note);
end; $$;
revoke all on function public.create_event_registration(uuid,uuid,integer,text,text,text) from public,anon;
grant execute on function public.create_event_registration(uuid,uuid,integer,text,text,text) to authenticated;

-- Immediate FREE confirmation is the event Host's choice, not membership
-- auto-approval. It remains available after the membership pilot expires.
create or replace function public.reserve_free_event_place_core(p_event_id uuid,p_ticket_type_id uuid,p_attendee_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.events%rowtype; ticket public.ticket_types%rowtype; saved_order uuid; saved_request uuid; account_status text;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirm your email first'; end if;
  select access_status::text into account_status from public.profiles where id=actor;
  if account_status is null or account_status not in ('active','pending') then raise exception 'This account cannot reserve a place'; end if;
  select * into target from public.events where id=p_event_id for share;
  if not found or target.status<>'published' or target.starts_at<=now() or target.registration_mode<>'manual_review'
    or not target.free_instant_booking or not public.can_view_event(p_event_id,actor) then raise exception 'Instant free booking is not available for this event'; end if;
  if account_status<>'active' and (target.audience<>'public'
    or not coalesce((select enabled from public.feature_flags where key='event_guest_access'),false)
    or not exists(select 1 from hat_event_ops.guest_details where event_id=p_event_id and user_id=actor)) then raise exception 'Guest booking is not open for this event'; end if;
  if exists(select 1 from public.ticket_types where event_id=p_event_id and status='on_sale' and price_minor<>0) then raise exception 'Free booking is unavailable while a paid choice is on sale'; end if;
  if exists(select 1 from public.registration_requests where event_id=p_event_id and user_id=actor and status='rejected') then raise exception 'This request was declined. Contact the event team if you need help'; end if;
  if exists(select 1 from public.registration_requests where event_id=p_event_id and user_id=actor and status<>'cancelled') then raise exception 'You already have a place or request for this event'; end if;
  select * into ticket from public.ticket_types where id=p_ticket_type_id and event_id=p_event_id and status='on_sale' and price_minor=0 for update;
  if not found then raise exception 'Free place is unavailable'; end if;
  if (ticket.sales_start_at is not null and ticket.sales_start_at>now()) or (ticket.sales_end_at is not null and ticket.sales_end_at<now()) then raise exception 'Bookings are not open'; end if;
  insert into public.orders(user_id,event_id,status,processing_mode,currency,subtotal_minor,total_minor)
    values(actor,p_event_id,'approved','manual_review',ticket.currency,0,0) returning id into saved_order;
  -- Existing event-capacity trigger + outer ticket-row lock enforce both caps.
  insert into public.order_items(order_id,ticket_type_id,quantity,unit_price_minor,line_total_minor) values(saved_order,ticket.id,1,0,0);
  insert into public.registration_requests(event_id,user_id,order_id,status,attendee_note) values(p_event_id,actor,saved_order,'approved',nullif(trim(p_attendee_note),''))
    on conflict(event_id,user_id) do update set order_id=excluded.order_id,status='approved',attendee_note=excluded.attendee_note,updated_at=now()
    where public.registration_requests.status='cancelled' returning id into saved_request;
  if saved_request is null then raise exception 'You already have a place for this event'; end if;
  perform public.fulfill_registration_order(saved_order,'free_instant_booking');
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'registration.free_instant_confirmed','order',saved_order,jsonb_build_object('event_id',p_event_id,'ticket_type_id',ticket.id,'event_guest',account_status<>'active'));
  return saved_order;
end; $$;
revoke all on function public.reserve_free_event_place_core(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.set_event_free_instant_booking(p_event_id uuid,p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare target public.events%rowtype; actor uuid:=auth.uid();
begin
  if actor is null or p_enabled is null then raise exception 'Sign in and choose a booking setting'; end if;
  select * into target from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not public.is_admin(array['super_admin']::public.app_role[]) and not public.can_host_event(p_event_id) then raise exception 'Event Host or Super Admin access required'; end if;
  if p_enabled then
    if target.status<>'published' or target.starts_at<=now() or target.audience<>'public' or target.capacity is null or target.registration_mode<>'manual_review' then raise exception 'Instant places require a future, public, capacity-limited free event'; end if;
    if not exists(select 1 from public.ticket_types where event_id=p_event_id and status='on_sale' and price_minor=0)
      or exists(select 1 from public.ticket_types where event_id=p_event_id and status='on_sale' and price_minor<>0) then raise exception 'All available ticket choices must be free'; end if;
  end if;
  update public.events set free_instant_booking=p_enabled,updated_by=actor,updated_at=now() where id=p_event_id;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'event.free_instant_booking_changed','event',p_event_id,jsonb_build_object('enabled',p_enabled));
  return p_enabled;
end; $$;
revoke all on function public.set_event_free_instant_booking(uuid,boolean) from public,anon;
grant execute on function public.set_event_free_instant_booking(uuid,boolean) to authenticated;

alter function hat_tickets.build_ticket(uuid,uuid) rename to build_ticket_before_invitations;
revoke all on function hat_tickets.build_ticket_before_invitations(uuid,uuid) from public,anon,authenticated,service_role;
create function hat_tickets.build_ticket(p_event_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ticket jsonb; linked jsonb;
begin
  ticket:=hat_tickets.build_ticket_before_invitations(p_event_id,p_user_id);
  if ticket is null then return null; end if;
  select jsonb_build_object('name',c.name,'slug',c.slug) into linked from public.community_event_links l join public.communities c on c.id=l.community_id
    where l.event_id=p_event_id and c.status='published' and (c.public_preview_enabled or exists(select 1 from public.community_memberships m where m.community_id=c.id and m.user_id=p_user_id and m.status='active'))
    order by l.created_at,c.id limit 1;
  return ticket||jsonb_build_object('guest_only',not public.is_active_member(p_user_id),'community',linked);
end; $$;
revoke all on function hat_tickets.build_ticket(uuid,uuid) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
