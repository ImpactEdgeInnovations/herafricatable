begin;

create table public.connection_outcomes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  outcome_type text not null check (
    outcome_type in (
      'collaboration',
      'referral',
      'mentorship',
      'client',
      'investment',
      'friendship',
      'knowledge',
      'other'
    )
  ),
  occurred_on date not null,
  private_detail text not null check (
    char_length(private_detail) between 10 and 2000
  ),
  share_anonymously boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index connection_outcomes_owner_idx
  on public.connection_outcomes (owner_id, occurred_on desc);
create index connection_outcomes_aggregate_idx
  on public.connection_outcomes (occurred_on desc, outcome_type)
  where share_anonymously;

alter table public.connection_outcomes enable row level security;
create policy "Members read own connection outcomes"
  on public.connection_outcomes
  for select
  to authenticated
  using (owner_id = auth.uid());

create or replace function public.record_connection_outcome(
  p_connection_id uuid,
  p_outcome_type text,
  p_occurred_on date,
  p_private_detail text,
  p_share_anonymously boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_type text := lower(trim(coalesce(p_outcome_type, '')));
  clean_detail text := trim(coalesce(p_private_detail, ''));
  saved_id uuid;
begin
  if not public.is_active_member(actor)
    or not exists (
      select 1
      from public.connections connection
      where connection.id = p_connection_id
        and actor in (connection.user_low, connection.user_high)
        and connection.status = 'accepted'
    )
  then
    raise exception 'Accepted connection required';
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

  insert into public.connection_outcomes (
    owner_id,
    connection_id,
    outcome_type,
    occurred_on,
    private_detail,
    share_anonymously
  )
  values (
    actor,
    p_connection_id,
    clean_type,
    p_occurred_on,
    clean_detail,
    coalesce(p_share_anonymously, false)
  )
  returning id into saved_id;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'connection.outcome_recorded',
    'connection_outcome',
    saved_id,
    jsonb_build_object(
      'outcome_type', clean_type,
      'shared_anonymously', coalesce(p_share_anonymously, false)
    )
  );
  return saved_id;
end;
$$;

create or replace function public.list_my_connection_outcomes()
returns table (
  outcome_id uuid,
  connection_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  outcome_type text,
  occurred_on date,
  private_detail text,
  share_anonymously boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active visible membership required';
  end if;
  return query
  select
    outcome.id,
    outcome.connection_id,
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.job_title,
    profile.company,
    outcome.outcome_type,
    outcome.occurred_on,
    outcome.private_detail,
    outcome.share_anonymously,
    outcome.created_at
  from public.connection_outcomes outcome
  join public.connections connection
    on connection.id = outcome.connection_id
    and connection.status = 'accepted'
  join public.profiles profile
    on profile.id = case
      when connection.user_low = auth.uid()
      then connection.user_high
      else connection.user_low
    end
  where outcome.owner_id = auth.uid()
    and auth.uid() in (connection.user_low, connection.user_high)
    and profile.access_status = 'active'
    and not public.is_blocked_pair(auth.uid(), profile.id)
  order by outcome.occurred_on desc, outcome.created_at desc;
end;
$$;

create or replace function public.remove_connection_outcome(
  p_outcome_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  delete from public.connection_outcomes
  where id = p_outcome_id and owner_id = actor;
  if not found then
    raise exception 'Connection outcome not found';
  end if;
  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id
  )
  values (
    actor,
    'connection.outcome_removed',
    'connection_outcome',
    p_outcome_id
  );
end;
$$;

create or replace function public.get_connection_outcome_summary(
  p_days integer default 365
)
returns table (
  outcome_type text,
  outcome_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  return query
  select outcome.outcome_type, count(*)::bigint
  from public.connection_outcomes outcome
  join public.connections connection on connection.id = outcome.connection_id
  join public.profiles owner_profile on owner_profile.id = outcome.owner_id
  join public.profiles low_profile on low_profile.id = connection.user_low
  join public.profiles high_profile on high_profile.id = connection.user_high
  where outcome.share_anonymously
    and outcome.occurred_on >= current_date
      - least(greatest(coalesce(p_days, 365), 1), 730)
    and not owner_profile.is_test_account
    and not low_profile.is_test_account
    and not high_profile.is_test_account
  group by outcome.outcome_type
  order by count(*) desc, outcome.outcome_type;
end;
$$;

revoke all on function public.record_connection_outcome(uuid, text, date, text, boolean) from public;
grant execute on function public.record_connection_outcome(uuid, text, date, text, boolean) to authenticated;
revoke all on function public.list_my_connection_outcomes() from public;
grant execute on function public.list_my_connection_outcomes() to authenticated;
revoke all on function public.remove_connection_outcome(uuid) from public;
grant execute on function public.remove_connection_outcome(uuid) to authenticated;
revoke all on function public.get_connection_outcome_summary(integer) from public;
grant execute on function public.get_connection_outcome_summary(integer) to authenticated;

commit;
