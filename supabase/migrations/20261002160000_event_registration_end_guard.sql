begin;

-- Keep the already-audited registration implementation behind one public
-- entry point, so neither a stale link nor a direct RPC can request a place
-- after the event ends. This covers free/manual and automatic checkout.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = 'create_event_registration_core'
  ) then
    alter function public.create_event_registration(
      uuid, uuid, integer, text, text, text
    ) rename to create_event_registration_core;
  end if;
end;
$$;
revoke all on function public.create_event_registration_core(
  uuid, uuid, integer, text, text, text
) from public, anon, authenticated;

create or replace function public.create_event_registration(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_quantity integer,
  p_attendee_note text,
  p_manual_reference text,
  p_manual_note text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.events event
    where event.id = p_event_id and event.status = 'published'
      and event.ends_at > now()
  ) then
    raise exception 'This event is over or no longer open for registration';
  end if;
  return public.create_event_registration_core(
    p_event_id, p_ticket_type_id, p_quantity, p_attendee_note,
    p_manual_reference, p_manual_note
  );
end;
$$;
revoke all on function public.create_event_registration(
  uuid, uuid, integer, text, text, text
) from public;
grant execute on function public.create_event_registration(
  uuid, uuid, integer, text, text, text
) to authenticated;

create or replace function public.event_registration_end_guard_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select not pg_catalog.has_function_privilege(
      'authenticated', routine.oid, 'EXECUTE')
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = 'create_event_registration_core'
  ), false);
$$;
revoke all on function public.event_registration_end_guard_ready() from public;
grant execute on function public.event_registration_end_guard_ready()
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
