begin;

-- A venue brand and city do not tell a guest which door to use. This applies
-- to both Admin saves and Host-draft approval, which publish by different RPCs.
create or replace function public.enforce_public_event_arrival_details()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'published' and new.audience = 'public'
    and new.format in ('in_person', 'hybrid')
    and not exists (
      select 1 from public.venues venue
      where venue.id = new.venue_id
        and nullif(pg_catalog.btrim(venue.name), '') is not null
        and nullif(pg_catalog.btrim(venue.city), '') is not null
        and nullif(pg_catalog.btrim(venue.country), '') is not null
        and (nullif(pg_catalog.btrim(venue.address_line), '') is not null
          or nullif(pg_catalog.btrim(venue.map_url), '') is not null)
    ) then
    raise exception 'Add the exact venue address or map link before publishing';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_public_event_arrival_details() from public;
drop trigger if exists public_event_arrival_details_guard on public.events;
create trigger public_event_arrival_details_guard
before insert or update of status, audience, format, venue_id on public.events
for each row execute function public.enforce_public_event_arrival_details();

-- Changing the venue row itself must not erase the arrival details of an
-- already-published public event. Drafts remain freely editable.
create or replace function public.preserve_public_event_arrival_details()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.events event
    where event.venue_id = new.id and event.status = 'published'
      and event.audience = 'public' and event.format in ('in_person', 'hybrid')
  ) and (
    nullif(pg_catalog.btrim(new.name), '') is null
    or nullif(pg_catalog.btrim(new.city), '') is null
    or nullif(pg_catalog.btrim(new.country), '') is null
    or (nullif(pg_catalog.btrim(new.address_line), '') is null
      and nullif(pg_catalog.btrim(new.map_url), '') is null)
  ) then
    raise exception 'Keep an exact address or map link while this event is public';
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_public_event_arrival_details() from public;
drop trigger if exists published_event_venue_arrival_guard on public.venues;
create trigger published_event_venue_arrival_guard
before update of name, city, country, address_line, map_url on public.venues
for each row execute function public.preserve_public_event_arrival_details();

create or replace function public.event_arrival_details_guard_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_trigger tg
    join pg_catalog.pg_class rel on rel.oid = tg.tgrelid
    join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relname = 'events'
      and tg.tgname = 'public_event_arrival_details_guard'
      and tg.tgenabled = 'O'
  ) and exists (
    select 1 from pg_catalog.pg_trigger tg
    join pg_catalog.pg_class rel on rel.oid = tg.tgrelid
    join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relname = 'venues'
      and tg.tgname = 'published_event_venue_arrival_guard'
      and tg.tgenabled = 'O'
  );
$$;
revoke all on function public.event_arrival_details_guard_ready() from public;
grant execute on function public.event_arrival_details_guard_ready()
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
