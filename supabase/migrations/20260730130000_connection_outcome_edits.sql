begin;

create or replace function public.update_connection_outcome(
  p_outcome_id uuid,
  p_outcome_type text,
  p_occurred_on date,
  p_private_detail text,
  p_share_anonymously boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_type text := lower(trim(coalesce(p_outcome_type, '')));
  clean_detail text := trim(coalesce(p_private_detail, ''));
begin
  if not public.is_active_member(actor) then
    raise exception 'Active visible membership required';
  end if;
  if clean_type not in (
    'collaboration',
    'referral',
    'mentorship',
    'client',
    'investment',
    'friendship',
    'knowledge',
    'other'
  )
  then
    raise exception 'Choose a valid outcome';
  end if;
  if p_occurred_on is null
    or p_occurred_on > current_date
    or p_occurred_on < current_date - 3650
  then
    raise exception 'Choose a valid outcome date';
  end if;
  if char_length(clean_detail) not between 10 and 2000 then
    raise exception 'Private detail must be between 10 and 2000 characters';
  end if;

  update public.connection_outcomes
  set outcome_type = clean_type,
      occurred_on = p_occurred_on,
      private_detail = clean_detail,
      share_anonymously = coalesce(p_share_anonymously, false),
      updated_at = now()
  where id = p_outcome_id
    and owner_id = actor;
  if not found then
    raise exception 'Connection outcome not found';
  end if;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'connection.outcome_updated',
    'connection_outcome',
    p_outcome_id,
    jsonb_build_object(
      'outcome_type', clean_type,
      'shared_anonymously', coalesce(p_share_anonymously, false)
    )
  );
end;
$$;

revoke all on function public.update_connection_outcome(uuid, text, date, text, boolean) from public;
grant execute on function public.update_connection_outcome(uuid, text, date, text, boolean) to authenticated;

commit;
