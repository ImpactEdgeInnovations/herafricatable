begin;

-- Event approval issues one membership and one private check-in pass to the
-- ordering account. Until named companion passes exist, an event order must
-- not reserve or charge for additional people it cannot admit.
create or replace function public.enforce_one_pass_per_event_order_item()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.quantity <> 1 and exists (
    select 1 from public.orders target
    where target.id = new.order_id and target.order_type = 'event'
  ) then
    raise exception 'Each attendee must request their own event place';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_one_pass_per_event_order_item() from public;

drop trigger if exists one_pass_per_event_order_item on public.order_items;
create trigger one_pass_per_event_order_item
before insert or update of order_id, quantity on public.order_items
for each row execute function public.enforce_one_pass_per_event_order_item();

create or replace function public.event_single_seat_guard_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.order_items'::pg_catalog.regclass
      and trigger_row.tgname = 'one_pass_per_event_order_item'
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgfoid =
        'public.enforce_one_pass_per_event_order_item()'::pg_catalog.regprocedure
  );
$$;
revoke all on function public.event_single_seat_guard_ready() from public;
grant execute on function public.event_single_seat_guard_ready()
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
