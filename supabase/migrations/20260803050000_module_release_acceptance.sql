begin;

create table if not exists public.module_release_checks (
  feature_key text not null references public.feature_flags(key) on delete cascade,
  check_key text not null,
  label text not null,
  guidance text not null,
  sort_order integer not null default 100,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'passed', 'blocked')),
  owner_label text check (owner_label is null or char_length(owner_label) <= 120),
  evidence_note text check (evidence_note is null or char_length(evidence_note) <= 2000),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (feature_key, check_key)
);

alter table public.module_release_checks
  add column if not exists sort_order integer not null default 100;
alter table public.module_release_checks enable row level security;

create or replace function public.module_release_catalog()
returns table(
  feature_key text,
  feature_label text,
  module_key text,
  sort_order integer
)
language sql
immutable
security definer
set search_path = ''
as $$
  values
    ('communities', 'Communities', 'community_core', 10),
    ('communities', 'Communities', 'community_conversations', 10),
    ('communities', 'Communities', 'community_member_experience', 10),
    ('communities', 'Communities', 'community_programmes', 10),
    ('communities', 'Communities', 'community_release', 10),
    ('community_creator_commerce', 'Community host payments', 'community_commerce', 20),
    ('learning', 'Learning', 'learning', 30),
    ('referrals', 'Referrals', 'referrals', 40),
    ('memberships', 'Membership checkout', 'membership', 50),
    ('circles', 'Circles', 'circles', 60),
    ('partner_perks', 'Partner benefits', 'perks', 70)
$$;

with controlled_features as (
  select distinct catalog.feature_key
  from public.module_release_catalog() catalog
),
required_checks(check_key, label, guidance, sort_order) as (
  values
    (
      'two_account_journey',
      'Complete the two-account member journey',
      'Use two approved test members to complete the main journey, including the empty, success and recoverable error states.',
      10
    ),
    (
      'privacy_and_permissions',
      'Verify privacy and permissions',
      'Confirm a member cannot see private records, controls or content belonging to another member, host or Admin role.',
      20
    ),
    (
      'admin_operations',
      'Rehearse Admin support',
      'Complete the approval, review, correction and member-support actions an Admin will need during the first live week.',
      30
    ),
    (
      'rollback_and_recovery',
      'Rehearse pause and recovery',
      'Pause the feature, confirm member data remains intact, restore access safely and record who owns the live response.',
      40
    )
)
insert into public.module_release_checks(
  feature_key,
  check_key,
  label,
  guidance,
  sort_order
)
select
  controlled_features.feature_key,
  required_checks.check_key,
  required_checks.label,
  required_checks.guidance,
  required_checks.sort_order
from controlled_features
cross join required_checks
on conflict (feature_key, check_key) do update
set label = excluded.label,
    guidance = excluded.guidance,
    sort_order = excluded.sort_order;

create or replace function public.list_module_release_acceptance()
returns table(
  feature_key text,
  feature_label text,
  feature_sort_order integer,
  enabled boolean,
  database_ready boolean,
  missing_database_modules text[],
  check_key text,
  check_label text,
  guidance text,
  status text,
  owner_label text,
  evidence_note text,
  verified_at timestamptz,
  verified_by_name text,
  updated_at timestamptz,
  release_ready boolean
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
  with catalog as (
    select
      item.feature_key,
      min(item.feature_label) as feature_label,
      min(item.sort_order) as feature_sort_order,
      array_agg(item.module_key order by item.module_key) as required_modules
    from public.module_release_catalog() item
    group by item.feature_key
  ),
  database_state as (
    select readiness.module_key, readiness.ready
    from public.list_database_release_readiness() readiness
  ),
  evaluated as (
    select
      catalog.*,
      coalesce(bool_and(coalesce(database_state.ready, false)), false) as database_ready,
      coalesce(
        array_agg(dependency.module_key order by dependency.module_key)
          filter (where not coalesce(database_state.ready, false)),
        array[]::text[]
      ) as missing_database_modules
    from catalog
    cross join lateral unnest(catalog.required_modules) dependency(module_key)
    left join database_state on database_state.module_key = dependency.module_key
    group by
      catalog.feature_key,
      catalog.feature_label,
      catalog.feature_sort_order,
      catalog.required_modules
  ),
  check_totals as (
    select
      release_check.feature_key,
      count(*) as required_checks,
      count(*) filter (where release_check.status = 'passed') as passed_checks
    from public.module_release_checks release_check
    group by release_check.feature_key
  )
  select
    evaluated.feature_key,
    evaluated.feature_label,
    evaluated.feature_sort_order,
    coalesce(flag.enabled, false),
    evaluated.database_ready,
    evaluated.missing_database_modules,
    release_check.check_key,
    release_check.label,
    release_check.guidance,
    release_check.status,
    release_check.owner_label,
    release_check.evidence_note,
    release_check.verified_at,
    verifier.display_name,
    release_check.updated_at,
    evaluated.database_ready
      and check_totals.required_checks > 0
      and check_totals.required_checks = check_totals.passed_checks
  from evaluated
  join public.feature_flags flag on flag.key = evaluated.feature_key
  join public.module_release_checks release_check
    on release_check.feature_key = evaluated.feature_key
  join check_totals on check_totals.feature_key = evaluated.feature_key
  left join public.profiles verifier on verifier.id = release_check.verified_by
  order by
    evaluated.feature_sort_order,
    release_check.sort_order,
    release_check.check_key;
end;
$$;

create or replace function public.module_release_ready(p_feature_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(readiness.release_ready), false)
  from public.list_module_release_acceptance() readiness
  where readiness.feature_key = p_feature_key
$$;

create or replace function public.save_module_release_check(
  p_feature_key text,
  p_check_key text,
  p_status text,
  p_owner_label text default null,
  p_evidence_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_owner text := nullif(trim(coalesce(p_owner_label, '')), '');
  clean_evidence text := nullif(trim(coalesce(p_evidence_note, '')), '');
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_status not in ('not_started', 'in_progress', 'passed', 'blocked') then
    raise exception 'Unsupported acceptance status';
  end if;
  if p_status = 'passed' and char_length(coalesce(clean_evidence, '')) < 20 then
    raise exception 'Passed checks require concise evidence';
  end if;
  if p_status in ('in_progress', 'blocked') and clean_owner is null then
    raise exception 'Open checks require an accountable owner';
  end if;

  update public.module_release_checks
  set status = p_status,
      owner_label = clean_owner,
      evidence_note = clean_evidence,
      verified_by = case when p_status = 'passed' then auth.uid() else null end,
      verified_at = case when p_status = 'passed' then now() else null end,
      updated_at = now()
  where feature_key = p_feature_key
    and check_key = p_check_key;
  if not found then
    raise exception 'Module acceptance check not found';
  end if;

  insert into public.audit_events(actor_id, action, target_type, metadata)
  values (
    auth.uid(),
    'platform.module_release_check_updated',
    'feature_flag',
    jsonb_build_object(
      'feature_key', p_feature_key,
      'check_key', p_check_key,
      'status', p_status,
      'has_evidence', clean_evidence is not null
    )
  );
end;
$$;

create or replace function public.enforce_module_release_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.enabled then
    return new;
  end if;

  if (tg_op = 'INSERT' or not coalesce(old.enabled, false))
    and exists (
      select 1
      from public.module_release_catalog() catalog
      where catalog.feature_key = new.key
    )
    and not public.module_release_ready(new.key)
  then
    raise exception 'Complete this module in Admin Release before enabling it';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_module_release_acceptance_before_insert
  on public.feature_flags;
create trigger enforce_module_release_acceptance_before_insert
before insert on public.feature_flags
for each row execute function public.enforce_module_release_acceptance();

drop trigger if exists enforce_module_release_acceptance_before_update
  on public.feature_flags;
create trigger enforce_module_release_acceptance_before_update
before update of enabled on public.feature_flags
for each row execute function public.enforce_module_release_acceptance();

create or replace function public.set_feature_flag(
  p_key text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;

  if p_enabled
    and exists (
      select 1
      from public.module_release_catalog() catalog
      where catalog.feature_key = p_key
    )
    and not public.module_release_ready(p_key)
  then
    raise exception 'Complete this module in Admin Release before enabling it';
  end if;

  if p_key = 'communities'
    and p_enabled
    and exists (
      select 1
      from public.communities community
      where community.status = 'published'
        and not public.community_release_ready(community.id)
    )
  then
    raise exception 'Every published community must pass release acceptance';
  end if;

  update public.feature_flags
  set enabled = p_enabled,
      updated_by = auth.uid(),
      updated_at = now()
  where key = p_key;
  if not found then
    raise exception 'Feature flag not found';
  end if;

  insert into public.audit_events(actor_id, action, target_type, metadata)
  values (
    auth.uid(),
    'platform.feature_flag_changed',
    'feature_flag',
    jsonb_build_object('key', p_key, 'enabled', p_enabled)
  );
end;
$$;

revoke insert, update, delete on public.feature_flags from anon, authenticated;
revoke all on public.module_release_checks from public, anon, authenticated;
revoke all on function public.module_release_catalog() from public, anon, authenticated;
revoke all on function public.module_release_ready(text) from public, anon, authenticated;
revoke all on function public.enforce_module_release_acceptance() from public, anon, authenticated;
revoke all on function public.list_module_release_acceptance() from public;
grant execute on function public.list_module_release_acceptance() to authenticated;
revoke all on function public.save_module_release_check(text, text, text, text, text) from public;
grant execute on function public.save_module_release_check(text, text, text, text, text)
  to authenticated;
revoke all on function public.set_feature_flag(text, boolean) from public;
grant execute on function public.set_feature_flag(text, boolean) to authenticated;

comment on table public.module_release_checks is
  'Private Super Admin evidence used to gate production activation of controlled member modules.';
comment on function public.list_module_release_acceptance is
  'Super Admin-only module readiness view combining database dependencies and required acceptance evidence.';

commit;
