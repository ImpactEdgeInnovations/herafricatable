begin;

insert into public.feature_flags (key, enabled, description)
values (
  'table_guide',
  false,
  'Consent-led member concierge and privacy-safe connection recommendations'
)
on conflict (key) do nothing;

create table if not exists public.member_ai_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  assistant_enabled boolean not null default false,
  recommend_me boolean not null default false,
  consented_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.table_guide_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('success', 'refused', 'error', 'handoff')),
  category text not null check (
    category in ('getting_started', 'connections', 'communities', 'events', 'support', 'other')
  ),
  prompt_chars integer not null default 0 check (prompt_chars between 0 and 2000),
  response_chars integer not null default 0 check (response_chars between 0 and 5000),
  model text check (model is null or char_length(model) between 2 and 100),
  created_at timestamptz not null default now()
);

create index if not exists table_guide_usage_user_created_idx
  on public.table_guide_usage (user_id, created_at desc);
create index if not exists table_guide_usage_status_created_idx
  on public.table_guide_usage (status, created_at desc);

alter table public.member_ai_preferences enable row level security;
alter table public.table_guide_usage enable row level security;

drop policy if exists "Members read own AI preferences" on public.member_ai_preferences;
create policy "Members read own AI preferences"
  on public.member_ai_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members read own Table Guide usage" on public.table_guide_usage;
create policy "Members read own Table Guide usage"
  on public.table_guide_usage for select to authenticated
  using (user_id = auth.uid());

create or replace function public.table_guide_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select flag.enabled from public.feature_flags flag where flag.key = 'table_guide'),
    false
  );
$$;

create or replace function public.get_my_table_guide_access()
returns table (
  feature_enabled boolean,
  assistant_enabled boolean,
  recommend_me boolean,
  uses_today bigint,
  remaining_today integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  access_status public.member_access_status;
  usage_count bigint := 0;
begin
  select profile.access_status into access_status
  from public.profiles profile
  where profile.id = actor;

  if actor is null or access_status not in ('onboarding', 'active') then
    raise exception 'Approved membership required';
  end if;

  select count(*) into usage_count
  from public.table_guide_usage usage
  where usage.user_id = actor
    and usage.created_at >= date_trunc('day', now());

  return query
  select
    public.table_guide_enabled(),
    coalesce(preference.assistant_enabled, false),
    coalesce(preference.recommend_me, false),
    usage_count,
    greatest(60 - usage_count, 0)::integer
  from (select 1) seed
  left join public.member_ai_preferences preference on preference.user_id = actor;
end;
$$;

create or replace function public.set_my_table_guide_preferences(
  p_assistant_enabled boolean,
  p_recommend_me boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  profile_status public.member_access_status;
  profile_hidden boolean;
begin
  select profile.access_status, profile.visibility_paused
  into profile_status, profile_hidden
  from public.profiles profile
  where profile.id = actor;

  if actor is null or profile_status not in ('onboarding', 'active') then
    raise exception 'Approved membership required';
  end if;
  if coalesce(p_recommend_me, false) and not coalesce(p_assistant_enabled, false) then
    raise exception 'Turn on the Table Guide before joining recommendations';
  end if;
  if coalesce(p_recommend_me, false) and profile_status <> 'active' then
    raise exception 'Complete your member profile before joining recommendations';
  end if;
  if coalesce(p_recommend_me, false) and profile_hidden then
    raise exception 'Show your profile before joining recommendations';
  end if;
  if coalesce(p_recommend_me, false)
    and public.connection_request_mode(actor) <> 'open' then
    raise exception 'Choose Open to introductions before joining recommendations';
  end if;

  insert into public.member_ai_preferences (
    user_id, assistant_enabled, recommend_me, consented_at, updated_at
  ) values (
    actor,
    coalesce(p_assistant_enabled, false),
    coalesce(p_recommend_me, false),
    case
      when coalesce(p_assistant_enabled, false) or coalesce(p_recommend_me, false)
        then now()
      else null
    end,
    now()
  )
  on conflict (user_id) do update set
    assistant_enabled = excluded.assistant_enabled,
    recommend_me = excluded.recommend_me,
    consented_at = case
      when excluded.assistant_enabled or excluded.recommend_me
        then coalesce(public.member_ai_preferences.consented_at, now())
      else null
    end,
    updated_at = now();

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  ) values (
    actor,
    'table_guide.preferences_updated',
    'profile',
    actor,
    jsonb_build_object(
      'assistant_enabled', coalesce(p_assistant_enabled, false),
      'recommend_me', coalesce(p_recommend_me, false)
    )
  );
end;
$$;

create or replace function public.list_table_guide_connections(
  p_limit integer default 6
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  industry text,
  country text,
  city text,
  bio text,
  common_interests text[],
  common_goals text[],
  match_score integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.table_guide_enabled() then
    raise exception 'Table Guide is not available yet';
  end if;
  if not public.is_active_member(actor) then
    raise exception 'Active membership required';
  end if;
  if not coalesce(
    (select preference.assistant_enabled
     from public.member_ai_preferences preference
     where preference.user_id = actor),
    false
  ) then
    raise exception 'Turn on the Table Guide first';
  end if;

  return query
  with candidates as (
    select
      profile.id,
      profile.display_name,
      profile.avatar_url,
      profile.job_title,
      profile.company,
      profile.industry,
      profile.country,
      profile.city,
      profile.bio,
      array(
        select interest.interest
        from public.profile_interests interest
        where interest.user_id = profile.id
          and exists (
            select 1 from public.profile_interests mine
            where mine.user_id = actor
              and lower(mine.interest) = lower(interest.interest)
          )
        order by interest.interest
      ) as shared_interests,
      array(
        select goal.goal_key
        from public.member_goals goal
        where goal.user_id = profile.id
          and exists (
            select 1 from public.member_goals mine
            where mine.user_id = actor and mine.goal_key = goal.goal_key
          )
        order by goal.goal_key
      ) as shared_goals,
      case
        when lower(coalesce(profile.industry, '')) = lower(coalesce(me.industry, ''))
          and nullif(trim(profile.industry), '') is not null then 25
        else 0
      end
      + case
          when lower(coalesce(profile.city, '')) = lower(coalesce(me.city, ''))
            and nullif(trim(profile.city), '') is not null then 15
          else 0
        end
      + case
          when lower(coalesce(profile.country, '')) = lower(coalesce(me.country, ''))
            and nullif(trim(profile.country), '') is not null then 5
          else 0
        end as base_score
    from public.profiles profile
    join public.profiles me on me.id = actor
    join public.member_ai_preferences preference
      on preference.user_id = profile.id and preference.recommend_me
    where profile.id <> actor
      and profile.access_status = 'active'
      and profile.profile_completion = 100
      and not profile.visibility_paused
      and public.connection_request_mode(profile.id) = 'open'
      and not public.is_blocked_pair(actor, profile.id)
      and not exists (
        select 1 from public.connections connection
        where connection.user_low = least(actor, profile.id)
          and connection.user_high = greatest(actor, profile.id)
          and connection.status in ('pending', 'accepted')
      )
  ), scored as (
    select
      candidate.*,
      least(
        100,
        candidate.base_score
          + cardinality(candidate.shared_interests) * 8
          + cardinality(candidate.shared_goals) * 12
      )::integer as score
    from candidates candidate
  )
  select
    scored.id,
    scored.display_name,
    scored.avatar_url,
    scored.job_title,
    scored.company,
    scored.industry,
    scored.country,
    scored.city,
    scored.bio,
    scored.shared_interests,
    scored.shared_goals,
    scored.score
  from scored
  order by scored.score desc, scored.display_name nulls last
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
end;
$$;

create or replace function public.record_table_guide_usage(
  p_status text,
  p_category text,
  p_prompt_chars integer,
  p_response_chars integer,
  p_model text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor and profile.access_status in ('onboarding', 'active')
  ) then
    raise exception 'Approved membership required';
  end if;
  if p_status not in ('success', 'refused', 'error', 'handoff') then
    raise exception 'Unsupported Table Guide status';
  end if;
  if p_category not in ('getting_started', 'connections', 'communities', 'events', 'support', 'other') then
    raise exception 'Unsupported Table Guide category';
  end if;

  insert into public.table_guide_usage (
    user_id, status, category, prompt_chars, response_chars, model
  ) values (
    actor,
    p_status,
    p_category,
    least(greatest(coalesce(p_prompt_chars, 0), 0), 2000),
    least(greatest(coalesce(p_response_chars, 0), 0), 5000),
    nullif(left(trim(coalesce(p_model, '')), 100), '')
  );
end;
$$;

create or replace function public.get_table_guide_admin()
returns table (
  feature_enabled boolean,
  assistant_members bigint,
  recommended_members bigint,
  requests_24h bigint,
  refusals_24h bigint,
  handoffs_24h bigint,
  last_used_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;

  return query
  select
    public.table_guide_enabled(),
    (select count(*) from public.member_ai_preferences preference where preference.assistant_enabled),
    (select count(*) from public.member_ai_preferences preference where preference.recommend_me),
    (select count(*) from public.table_guide_usage usage where usage.created_at >= now() - interval '24 hours'),
    (select count(*) from public.table_guide_usage usage where usage.status = 'refused' and usage.created_at >= now() - interval '24 hours'),
    (select count(*) from public.table_guide_usage usage where usage.status = 'handoff' and usage.created_at >= now() - interval '24 hours'),
    (select max(usage.created_at) from public.table_guide_usage usage);
end;
$$;

revoke all on function public.table_guide_enabled() from public;
grant execute on function public.table_guide_enabled() to authenticated;
revoke all on function public.get_my_table_guide_access() from public;
grant execute on function public.get_my_table_guide_access() to authenticated;
revoke all on function public.set_my_table_guide_preferences(boolean, boolean) from public;
grant execute on function public.set_my_table_guide_preferences(boolean, boolean) to authenticated;
revoke all on function public.list_table_guide_connections(integer) from public;
grant execute on function public.list_table_guide_connections(integer) to authenticated;
revoke all on function public.record_table_guide_usage(text, text, integer, integer, text) from public;
grant execute on function public.record_table_guide_usage(text, text, integer, integer, text) to authenticated;
revoke all on function public.get_table_guide_admin() from public;
grant execute on function public.get_table_guide_admin() to authenticated;

comment on table public.member_ai_preferences is
  'Explicit member consent for the Table Guide and inclusion in connection recommendations.';
comment on table public.table_guide_usage is
  'Privacy-minimised Table Guide operations metadata. Prompts and responses are never stored.';
comment on function public.list_table_guide_connections(integer) is
  'Deterministic suggestions limited to active, visible, unblocked, fully onboarded members who explicitly opted in and accept direct introductions.';

commit;
