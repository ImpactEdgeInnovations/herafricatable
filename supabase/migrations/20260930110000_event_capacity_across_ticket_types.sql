begin;

-- Ticket inventory is per ticket type; event capacity is shared by all
-- ticket types. Serialize reservation checks for one event so simultaneous
-- requests for different ticket types cannot both take its final place.
create or replace function public.enforce_event_capacity_on_order_item()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  target public.orders%rowtype;
  event_capacity integer;
  reserved bigint;
  excluded_item uuid;
begin
  select * into target from public.orders where id = new.order_id;
  if not found or target.order_type <> 'event'
    or target.status in ('cancelled', 'expired', 'refunded') then
    return new;
  end if;
  if tg_op = 'UPDATE' then excluded_item := old.id; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target.event_id::text, 0::bigint)
  );
  select capacity into event_capacity from public.events where id = target.event_id;
  if event_capacity is null then return new; end if;
  select coalesce(sum(item.quantity), 0) into reserved
  from public.order_items item
  join public.orders booking on booking.id = item.order_id
  where booking.event_id = target.event_id
    and booking.order_type = 'event'
    and booking.status not in ('cancelled', 'expired', 'refunded')
    and (excluded_item is null or item.id <> excluded_item);
  if reserved + new.quantity > event_capacity then
    raise exception 'Event is full';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_event_capacity_on_order_item() from public;
drop trigger if exists event_capacity_order_item on public.order_items;
create trigger event_capacity_order_item
before insert or update of order_id, ticket_type_id, quantity on public.order_items
for each row execute function public.enforce_event_capacity_on_order_item();

-- A previously cancelled or expired order must not become active again if
-- its seats have since been taken by other people.
create or replace function public.enforce_event_capacity_on_order_reactivation()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  event_capacity integer;
  reserved bigint;
  own_seats bigint;
begin
  if new.order_type <> 'event'
    or new.status in ('cancelled', 'expired', 'refunded')
    or (old.order_type = 'event'
      and old.status not in ('cancelled', 'expired', 'refunded')
      and old.event_id = new.event_id) then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.event_id::text, 0::bigint)
  );
  select capacity into event_capacity from public.events where id = new.event_id;
  if event_capacity is null then return new; end if;
  select coalesce(sum(item.quantity), 0) into reserved
  from public.order_items item
  join public.orders booking on booking.id = item.order_id
  where booking.event_id = new.event_id and booking.id <> new.id
    and booking.order_type = 'event'
    and booking.status not in ('cancelled', 'expired', 'refunded');
  select coalesce(sum(quantity), 0) into own_seats
  from public.order_items where order_id = new.id;
  if reserved + own_seats > event_capacity then
    raise exception 'Event is full';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_event_capacity_on_order_reactivation() from public;
drop trigger if exists event_capacity_order_reactivation on public.orders;
create trigger event_capacity_order_reactivation
before update of status, order_type, event_id on public.orders
for each row execute function public.enforce_event_capacity_on_order_reactivation();

-- Do not quietly reduce a published event below its already reserved seats.
create or replace function public.enforce_event_capacity_on_event_edit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare reserved bigint;
begin
  if new.capacity is null or new.capacity is not distinct from old.capacity then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.id::text, 0::bigint)
  );
  select coalesce(sum(item.quantity), 0) into reserved
  from public.order_items item
  join public.orders booking on booking.id = item.order_id
  where booking.event_id = new.id and booking.order_type = 'event'
    and booking.status not in ('cancelled', 'expired', 'refunded');
  if reserved > new.capacity then
    raise exception 'Capacity is below places already requested';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_event_capacity_on_event_edit() from public;
drop trigger if exists event_capacity_event_edit on public.events;
create trigger event_capacity_event_edit
before update of capacity on public.events
for each row execute function public.enforce_event_capacity_on_event_edit();

create or replace function public.event_capacity_guard_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select count(*) = 3 from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgenabled = 'O' and (
    (trigger_row.tgrelid = 'public.order_items'::pg_catalog.regclass
      and trigger_row.tgname = 'event_capacity_order_item'
      and trigger_row.tgfoid =
        'public.enforce_event_capacity_on_order_item()'::pg_catalog.regprocedure)
    or (trigger_row.tgrelid = 'public.orders'::pg_catalog.regclass
      and trigger_row.tgname = 'event_capacity_order_reactivation'
      and trigger_row.tgfoid =
        'public.enforce_event_capacity_on_order_reactivation()'::pg_catalog.regprocedure)
    or (trigger_row.tgrelid = 'public.events'::pg_catalog.regclass
      and trigger_row.tgname = 'event_capacity_event_edit'
      and trigger_row.tgfoid =
        'public.enforce_event_capacity_on_event_edit()'::pg_catalog.regprocedure)
  );
$$;
revoke all on function public.event_capacity_guard_ready() from public;
grant execute on function public.event_capacity_guard_ready()
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
