begin;

create or replace function public.save_launch_gate_check(
  p_check_key text,
  p_status text,
  p_owner_label text,
  p_evidence_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  normalized_owner text := nullif(trim(p_owner_label), '');
  normalized_evidence text := nullif(trim(p_evidence_note), '');
  signoff_status text;
  target_required boolean;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;

  if p_status not in ('not_started', 'in_progress', 'passed', 'blocked') then
    raise exception 'Invalid launch gate status';
  end if;

  if p_status in ('in_progress', 'blocked') and normalized_owner is null then
    raise exception 'Add an accountable owner';
  end if;

  if p_status = 'passed'
    and char_length(coalesce(normalized_evidence, '')) < 20 then
    raise exception 'Passed checks require concise evidence';
  end if;

  if p_status = 'blocked'
    and char_length(coalesce(normalized_evidence, '')) < 10 then
    raise exception 'Blocked checks require a clear reason';
  end if;

  if normalized_evidence is not null
    and char_length(normalized_evidence) < 10 then
    raise exception 'Launch gate evidence must contain at least 10 characters';
  end if;

  if char_length(coalesce(normalized_owner, '')) > 120
    or char_length(coalesce(normalized_evidence, '')) > 2000 then
    raise exception 'Launch gate evidence is too long';
  end if;

  -- Every launch-gate update takes the same row lock. Sign-off cannot race a
  -- concurrent regression in another required check.
  select status into signoff_status
  from public.launch_gate_checks
  where check_key = 'launch_signoff'
  for update;
  if not found then
    raise exception 'Launch sign-off gate is unavailable';
  end if;

  select required into target_required
  from public.launch_gate_checks
  where check_key = p_check_key;
  if not found then
    raise exception 'Unknown launch gate';
  end if;

  if p_check_key = 'launch_signoff' and p_status = 'passed' then
    if normalized_owner is null then
      raise exception 'Name the accountable launch owner';
    end if;
    if exists (
      select 1 from public.launch_gate_checks gate
      where gate.required and gate.check_key <> 'launch_signoff'
        and (gate.status <> 'passed' or gate.verified_at is null
          or char_length(coalesce(gate.evidence_note, '')) < 20)
    ) then
      raise exception 'Complete every required launch check before final sign-off';
    end if;
  end if;

  update public.launch_gate_checks
  set status = p_status,
      owner_label = normalized_owner,
      evidence_note = normalized_evidence,
      verified_by = case when p_status = 'passed' then actor else null end,
      verified_at = case when p_status = 'passed' then now() else null end,
      updated_by = actor,
      updated_at = now()
  where check_key = p_check_key;

  if target_required and p_check_key <> 'launch_signoff'
    and p_status <> 'passed' and signoff_status = 'passed' then
    update public.launch_gate_checks
    set status = 'in_progress',
        evidence_note = left(
          'Previous sign-off reopened because ' || p_check_key ||
          ' is now ' || p_status || '. ' || coalesce(evidence_note, ''),
          2000
        ),
        verified_by = null,
        verified_at = null,
        updated_by = actor,
        updated_at = now()
    where check_key = 'launch_signoff';

    insert into public.audit_events (
      actor_id, action, target_type, target_id, metadata
    ) values (
      actor, 'launch.signoff_reopened', 'launch_gate', null,
      jsonb_build_object('changed_check_key', p_check_key, 'changed_status', p_status)
    );
  end if;

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  ) values (
    actor, 'launch.gate_updated', 'launch_gate', null,
    jsonb_build_object(
      'check_key', p_check_key,
      'status', p_status,
      'has_evidence', normalized_evidence is not null
    )
  );
end;
$$;

create or replace function public.launch_signoff_guard_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = 'save_launch_gate_check'
      and routine.prosrc like '%Complete every required launch check before final sign-off%'
      and routine.prosrc like '%launch.signoff_reopened%'
  );
$$;
revoke all on function public.launch_signoff_guard_ready() from public;
grant execute on function public.launch_signoff_guard_ready()
  to authenticated, service_role;

-- Repair a sign-off recorded before this guard existed if its supporting
-- evidence is no longer complete. Do not silently carry it forward as valid.
do $$
begin
  update public.launch_gate_checks
  set status = 'in_progress',
      evidence_note = left(
        'Previous sign-off reopened during launch-guard migration. ' ||
        coalesce(evidence_note, ''), 2000
      ),
      verified_by = null,
      verified_at = null,
      updated_at = now()
  where check_key = 'launch_signoff' and status = 'passed'
    and exists (
      select 1 from public.launch_gate_checks gate
      where gate.required and gate.check_key <> 'launch_signoff'
        and (gate.status <> 'passed' or gate.verified_at is null
          or char_length(coalesce(gate.evidence_note, '')) < 20)
    );

  if found then
    insert into public.audit_events (
      actor_id, action, target_type, target_id, metadata
    ) values (
      null, 'launch.signoff_reopened', 'launch_gate', null,
      jsonb_build_object('reason', 'incomplete_required_evidence_at_migration')
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
