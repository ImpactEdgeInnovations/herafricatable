alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending_payment','pending_review','paid','approved','fulfilled','cancelled','expired','refund_pending','refunded'));

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, reason text not null check (char_length(reason) between 10 and 1000),
  status text not null default 'requested' check (status in ('requested','approved','rejected','completed')),
  reviewer_id uuid references auth.users(id) on delete set null, reviewer_note text,
  requested_at timestamptz not null default now(), reviewed_at timestamptz, completed_at timestamptz, updated_at timestamptz not null default now()
);
create index refund_requests_status_idx on public.refund_requests(status,requested_at);
alter table public.refund_requests enable row level security;
create policy "Members read own refund requests" on public.refund_requests for select to authenticated using(user_id=auth.uid());
create policy "Event admins read refund requests" on public.refund_requests for select to authenticated using(exists(select 1 from public.orders where orders.id=refund_requests.order_id and public.can_manage_event(orders.event_id)));

create or replace function public.cancel_pending_registration(p_order_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.orders%rowtype;
begin
  select * into target from public.orders where id=p_order_id and user_id=actor for update;
  if not found or target.status not in ('pending_payment','pending_review') then raise exception 'Only a pending registration can be cancelled'; end if;
  update public.orders set status='cancelled',updated_at=now() where id=target.id;
  update public.registration_requests set status='cancelled',updated_at=now() where order_id=target.id;
  update public.manual_payment_reviews set status='rejected',submitter_note=concat_ws(E'\n',submitter_note,'Cancelled by applicant'),updated_at=now() where order_id=target.id and status='pending';
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'registration.cancelled','order',target.id,jsonb_build_object('reason',nullif(trim(p_reason),'')));
end; $$;

create or replace function public.request_order_refund(p_order_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.orders%rowtype; saved uuid;
begin
  if nullif(trim(p_reason),'') is null or char_length(trim(p_reason))<10 then raise exception 'Please provide a clear refund reason'; end if;
  select * into target from public.orders where id=p_order_id and user_id=actor for update;
  if not found or target.status<>'fulfilled' then raise exception 'This order is not eligible for a refund request'; end if;
  insert into public.refund_requests(order_id,user_id,reason) values(target.id,actor,trim(p_reason)) returning id into saved;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'refund.requested','order',target.id,jsonb_build_object('refund_request_id',saved)); return saved;
end; $$;

create or replace function public.review_refund_request(p_refund_id uuid,p_action text,p_reviewer_note text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.orders%rowtype; request_row public.refund_requests%rowtype;
begin
  select * into request_row from public.refund_requests where id=p_refund_id and status='requested' for update;
  if not found then raise exception 'Pending refund request not found'; end if;
  select * into target from public.orders where id=request_row.order_id for update;
  if actor is null or not public.can_manage_event(target.event_id) then raise exception 'Not authorized'; end if;
  if p_action not in ('approve','reject') then raise exception 'Unsupported refund action'; end if;
  if p_action='reject' and nullif(trim(p_reviewer_note),'') is null then raise exception 'A rejection reason is required'; end if;
  if p_action='reject' then
    update public.refund_requests set status='rejected',reviewer_id=actor,reviewer_note=trim(p_reviewer_note),reviewed_at=now(),updated_at=now() where id=p_refund_id;
  elsif target.processing_mode='manual_review' then
    update public.refund_requests set status='completed',reviewer_id=actor,reviewer_note=nullif(trim(p_reviewer_note),''),reviewed_at=now(),completed_at=now(),updated_at=now() where id=p_refund_id;
    update public.orders set status='refunded',updated_at=now() where id=target.id;
    update public.entitlements set status='revoked',revoked_at=now() where order_id=target.id and status='active';
    update public.event_memberships set status='cancelled',updated_at=now() where order_id=target.id;
  else
    update public.refund_requests set status='approved',reviewer_id=actor,reviewer_note=nullif(trim(p_reviewer_note),''),reviewed_at=now(),updated_at=now() where id=p_refund_id;
    update public.orders set status='refund_pending',updated_at=now() where id=target.id;
  end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'refund.'||p_action,'order',target.id,jsonb_build_object('refund_request_id',p_refund_id,'mode',target.processing_mode));
end; $$;

create or replace function public.list_event_refund_requests(p_event_id uuid)
returns table(refund_id uuid,order_id uuid,order_reference text,email text,display_name text,reason text,status text,processing_mode text,total_minor bigint,currency text,requested_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorized'; end if;
  return query select r.id,o.id,o.reference,u.email::text,p.display_name,r.reason,r.status,o.processing_mode,o.total_minor,o.currency,r.requested_at from public.refund_requests r join public.orders o on o.id=r.order_id join auth.users u on u.id=r.user_id left join public.profiles p on p.id=r.user_id where o.event_id=p_event_id order by r.requested_at desc;
end; $$;

revoke all on function public.cancel_pending_registration(uuid,text) from public; grant execute on function public.cancel_pending_registration(uuid,text) to authenticated;
revoke all on function public.request_order_refund(uuid,text) from public; grant execute on function public.request_order_refund(uuid,text) to authenticated;
revoke all on function public.review_refund_request(uuid,text,text) from public; grant execute on function public.review_refund_request(uuid,text,text) to authenticated;
revoke all on function public.list_event_refund_requests(uuid) from public; grant execute on function public.list_event_refund_requests(uuid) to authenticated;
