begin;

-- Keep the original, audited save operation as an internal implementation.
-- Public RPC callers must enter through the wrapper below.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public' and routine.proname = 'save_event_core'
  ) then
    alter function public.save_event(
      uuid, text, text, text, text, text, timestamptz, timestamptz, text, text,
      text, text, text, text, text, integer, text, boolean
    ) rename to save_event_core;
  end if;
end;
$$;
revoke all on function public.save_event_core(
  uuid, text, text, text, text, text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, integer, text, boolean
) from public, anon, authenticated;

create or replace function public.save_event(
  p_event_id uuid,
  p_title text,
  p_slug text,
  p_summary text,
  p_format text,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_venue_name text,
  p_city text,
  p_country text,
  p_address_line text,
  p_map_url text,
  p_online_url text,
  p_capacity integer,
  p_registration_mode text,
  p_is_featured boolean
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  previous public.events%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_event_id is null and not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Only a super admin can create an event';
  end if;
  if p_event_id is not null and not public.can_manage_event(p_event_id) then
    raise exception 'You are not authorized to manage this event';
  end if;

  if p_status = 'published' then
    if p_event_id is null then
      raise exception 'Save a private event draft before publishing';
    end if;

    select * into previous from public.events where id = p_event_id for update;
    if not found then raise exception 'Event not found'; end if;

    if previous.status <> 'published' and previous.audience = 'public' then
      if not exists (
        select 1 from public.event_safety_contacts where event_id = p_event_id
      ) then
        raise exception 'Add an event safety contact before publishing';
      end if;
      if exists (
        select 1 from public.event_hosts where event_id = p_event_id
      ) then
        raise exception 'Approve the Event Host draft to publish this event';
      end if;
    end if;
  end if;

  return public.save_event_core(
    p_event_id, p_title, p_slug, p_summary, p_format, p_status,
    p_starts_at, p_ends_at, p_timezone, p_venue_name, p_city, p_country,
    p_address_line, p_map_url, p_online_url, p_capacity,
    p_registration_mode, p_is_featured
  );
end;
$$;

revoke all on function public.save_event(
  uuid, text, text, text, text, text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, integer, text, boolean
) from public;
grant execute on function public.save_event(
  uuid, text, text, text, text, text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, integer, text, boolean
) to authenticated;

comment on function public.save_event is
  'Audited Admin event save; new public events must start private, and publication requires a safety contact and Host review when assigned.';

create or replace function public.event_publication_sequence_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select not pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE')
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public' and routine.proname = 'save_event_core'
  ), false);
$$;
revoke all on function public.event_publication_sequence_ready() from public;
grant execute on function public.event_publication_sequence_ready()
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
