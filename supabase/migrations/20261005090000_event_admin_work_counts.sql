begin;

-- Admin overview needs counts, not guest names, emails or payment details.
-- Use the same event scope as list_managed_events so event staff only see
-- events explicitly assigned to them.
create or replace function public.list_event_work_counts()
returns table (
  event_id uuid,
  registration_records bigint,
  pending_registrations bigint,
  confirmed_places bigint,
  pending_refunds bigint
)
language sql stable security definer set search_path = '' as $$
  select event.id,
    (select count(*) from public.registration_requests request
      where request.event_id = event.id and request.order_id is not null),
    (select count(*) from public.registration_requests request
      where request.event_id = event.id and request.status = 'pending_review'),
    (select count(*) from public.event_memberships membership
      where membership.event_id = event.id
        and membership.status in ('confirmed', 'attended')),
    (select count(*) from public.refund_requests refund
      join public.orders order_row on order_row.id = refund.order_id
      where order_row.event_id = event.id and refund.status = 'requested')
  from public.events event
  where public.can_manage_event(event.id)
  order by event.starts_at desc;
$$;

revoke all on function public.list_event_work_counts() from public;
grant execute on function public.list_event_work_counts() to authenticated;

notify pgrst, 'reload schema';
commit;
