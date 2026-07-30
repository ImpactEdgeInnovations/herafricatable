begin;

create table public.community_release_checks (
  community_id uuid not null references public.communities(id) on delete cascade,
  check_key text not null check (check_key ~ '^[a-z0-9_]+$'),
  label text not null check (char_length(label) between 3 and 120),
  guidance text not null check (char_length(guidance) between 10 and 600),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'passed', 'blocked')),
  owner_label text check (
    owner_label is null or char_length(owner_label) between 2 and 120
  ),
  evidence_note text check (
    evidence_note is null or char_length(evidence_note) between 10 and 2000
  ),
  required boolean not null default true,
  sort_order integer not null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (community_id, check_key)
);

create index community_release_checks_status_idx
  on public.community_release_checks(community_id, status, sort_order);

alter table public.community_release_checks enable row level security;

create or replace function public.seed_community_release_checks(
  p_community_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_release_checks(
    community_id,
    check_key,
    label,
    guidance,
    sort_order
  )
  values
    (
      p_community_id,
      'host_coverage',
      'Named host and backup moderator',
      'Confirm one active owner, one active moderator, the escalation route and who takes over if the host is unavailable.',
      10
    ),
    (
      p_community_id,
      'consent_and_admission',
      'Consent and admission boundaries',
      'Test invitation acceptance, access requests, approval, decline and removal. Nobody may enter through eligibility alone.',
      20
    ),
    (
      p_community_id,
      'conversation_and_blocking',
      'Conversation and blocking boundaries',
      'Test Ask, Offer, discussion, reply, appreciation, private save and follow controls, then confirm bilateral blocking removes prohibited visibility.',
      30
    ),
    (
      p_community_id,
      'safety_escalation',
      'Safety report and escalation',
      'Submit and review a community report. Confirm hosts see only the safety count while authorised moderators retain evidence access.',
      40
    ),
    (
      p_community_id,
      'notification_choices',
      'Member notification choices',
      'Verify room reply and briefing controls, global Activity preference, email opt-in defaults and the no-duplicate weekly briefing path.',
      50
    ),
    (
      p_community_id,
      'privacy_and_outcomes',
      'Roster, continuity and outcome privacy',
      'Confirm private contacts stay hidden, test accounts are excluded from Host aggregates, retention is thresholded and outcomes require three anonymous sharers.',
      60
    ),
    (
      p_community_id,
      'member_usability',
      'Non-technical member usability',
      'Complete the room start path, introduction, conversation, connection and gathering journey on mobile and desktop with a non-technical tester.',
      70
    ),
    (
      p_community_id,
      'operational_rehearsal',
      'Host operating rehearsal',
      'Rehearse admissions, an introduction reminder, an unanswered Ask, programming changes, read-only closure and host handover.',
      80
    )
  on conflict (community_id, check_key) do nothing;
end;
$$;

do $$
declare
  community record;
begin
  for community in select id from public.communities loop
    perform public.seed_community_release_checks(community.id);
  end loop;
end;
$$;

create or replace function public.seed_community_release_checks_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_community_release_checks(new.id);
  return new;
end;
$$;

create trigger seed_community_release_checks_after_insert
after insert on public.communities
for each row execute function public.seed_community_release_checks_trigger();

create or replace function public.list_community_release_checks(
  p_community_id uuid
)
returns table(
  check_key text,
  label text,
  guidance text,
  status text,
  owner_label text,
  evidence_note text,
  required boolean,
  sort_order integer,
  verified_by_name text,
  verified_at timestamptz,
  updated_at timestamptz,
  community_status text,
  feature_enabled boolean,
  active_owner_count bigint,
  active_moderator_count bigint
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
  select
    release_check.check_key,
    release_check.label,
    release_check.guidance,
    release_check.status,
    release_check.owner_label,
    release_check.evidence_note,
    release_check.required,
    release_check.sort_order,
    verifier.display_name,
    release_check.verified_at,
    release_check.updated_at,
    community.status,
    coalesce((
      select flag.enabled
      from public.feature_flags flag
      where flag.key = 'communities'
    ), false),
    (
      select count(*)
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.status = 'active'
        and membership.role = 'owner'
    ),
    (
      select count(*)
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.status = 'active'
        and membership.role = 'moderator'
    )
  from public.community_release_checks release_check
  join public.communities community on community.id = release_check.community_id
  left join public.profiles verifier on verifier.id = release_check.verified_by
  where release_check.community_id = p_community_id
  order by release_check.sort_order, release_check.check_key;
end;
$$;

create or replace function public.save_community_release_check(
  p_community_id uuid,
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
  clean_owner text := nullif(trim(p_owner_label), '');
  clean_evidence text := nullif(trim(p_evidence_note), '');
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_status not in ('not_started', 'in_progress', 'passed', 'blocked') then
    raise exception 'Invalid release check status';
  end if;
  if p_status in ('in_progress', 'blocked') and clean_owner is null then
    raise exception 'Add an accountable owner';
  end if;
  if p_status = 'passed'
    and char_length(coalesce(clean_evidence, '')) < 20 then
    raise exception 'Passed checks require concise evidence';
  end if;
  if p_status = 'blocked'
    and char_length(coalesce(clean_evidence, '')) < 10 then
    raise exception 'Blocked checks require a clear reason';
  end if;
  if clean_evidence is not null and char_length(clean_evidence) < 10 then
    raise exception 'Evidence must contain at least 10 characters';
  end if;
  if char_length(coalesce(clean_owner, '')) > 120
    or char_length(coalesce(clean_evidence, '')) > 2000 then
    raise exception 'Release evidence is too long';
  end if;

  update public.community_release_checks
  set status = p_status,
      owner_label = clean_owner,
      evidence_note = clean_evidence,
      verified_by = case when p_status = 'passed' then actor else null end,
      verified_at = case when p_status = 'passed' then now() else null end,
      updated_by = actor,
      updated_at = now()
  where community_id = p_community_id
    and check_key = p_check_key;

  if not found then
    raise exception 'Unknown community release check';
  end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'community.release_check_updated',
    'community',
    p_community_id,
    jsonb_build_object(
      'check_key', p_check_key,
      'status', p_status,
      'has_evidence', clean_evidence is not null
    )
  );
end;
$$;

create or replace function public.community_release_ready(
  p_community_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) = 8
    and bool_and(release_check.status = 'passed')
    and exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.status = 'active'
        and membership.role = 'owner'
    )
    and exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.status = 'active'
        and membership.role = 'moderator'
    )
  from public.community_release_checks release_check
  where release_check.community_id = p_community_id
    and release_check.required;
$$;

create or replace function public.publish_community_after_acceptance(
  p_community_id uuid,
  p_publish boolean
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

  perform 1
  from public.communities community
  where community.id = p_community_id
  for update;
  if not found then
    raise exception 'Community not found';
  end if;

  if p_publish and not public.community_release_ready(p_community_id) then
    raise exception 'Pass every release check and assign a backup moderator first';
  end if;

  update public.communities
  set status = case when p_publish then 'published' else 'draft' end,
      updated_at = now()
  where id = p_community_id;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    case
      when p_publish then 'community.release_approved'
      else 'community.returned_to_draft'
    end,
    'community',
    p_community_id,
    jsonb_build_object('published', p_publish)
  );
end;
$$;

create or replace function public.enforce_community_publish_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from 'published'
    )
    and not public.community_release_ready(new.id) then
    raise exception 'Community acceptance must pass before publishing';
  end if;
  return new;
end;
$$;

create trigger enforce_community_publish_acceptance_before_insert
before insert on public.communities
for each row execute function public.enforce_community_publish_acceptance();

create trigger enforce_community_publish_acceptance_before_update
before update of status on public.communities
for each row execute function public.enforce_community_publish_acceptance();

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

with controlled_release as (
  update public.feature_flags flag
  set enabled = false,
      updated_at = now()
  where flag.key = 'communities'
    and flag.enabled
    and exists (
      select 1
      from public.communities community
      where community.status = 'published'
        and not public.community_release_ready(community.id)
    )
  returning flag.key
)
insert into public.audit_events(
  actor_id,
  action,
  target_type,
  metadata
)
select
  null,
  'community.release_guard_applied',
  'feature_flag',
  jsonb_build_object('key', controlled_release.key, 'enabled', false)
from controlled_release;

create or replace function public.ensure_founding_cohort(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved uuid;
  event_title text;
  event_end timestamptz;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;

  select title, ends_at into event_title, event_end
  from public.events
  where id = p_event_id;
  if event_title is null then
    raise exception 'Event not found';
  end if;

  select id into saved
  from public.communities
  where slug = 'founding-table-nairobi'
  for update;

  if saved is null then
    insert into public.communities(
      slug,
      name,
      description,
      community_type,
      status,
      created_by
    )
    values (
      'founding-table-nairobi',
      'The Founding Table — Nairobi',
      'A private, hosted room where confirmed founding guests can introduce themselves, exchange useful asks and offers, and continue relationships after the Nairobi table.',
      'private',
      'draft',
      actor
    )
    returning id into saved;

    insert into public.community_memberships(
      community_id,
      user_id,
      role,
      status,
      invited_by,
      reviewed_by,
      joined_at
    )
    values (saved, actor, 'owner', 'active', actor, actor, now());
  end if;

  perform public.seed_community_release_checks(saved);

  insert into public.community_cohorts(
    community_id,
    event_id,
    eligibility_scope,
    status,
    welcome_message,
    introduction_prompt,
    follow_up_until,
    created_by
  )
  values (
    saved,
    p_event_id,
    'confirmed_event',
    'active',
    'Welcome to the Founding Table. This is a hosted room for thoughtful introductions, useful exchanges and relationships that continue beyond the event. Participation is voluntary and private contact remains permission-based.',
    'Introduce yourself through four short prompts: who you are, what you are building, what you can offer and what you are seeking.',
    greatest(event_end + interval '60 days', now() + interval '60 days'),
    actor
  )
  on conflict (community_id) do update
  set event_id = excluded.event_id,
      eligibility_scope = excluded.eligibility_scope,
      status = 'active',
      follow_up_until = excluded.follow_up_until,
      updated_at = now();

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'cohort.founding_room_ensured',
    'community',
    saved,
    jsonb_build_object(
      'event_id', p_event_id,
      'event_title', event_title,
      'release_state', 'controlled'
    )
  );

  return saved;
end;
$$;

revoke all on function public.seed_community_release_checks(uuid) from public;
revoke all on function public.list_community_release_checks(uuid) from public;
grant execute on function public.list_community_release_checks(uuid)
  to authenticated;
revoke all on function public.save_community_release_check(
  uuid,
  text,
  text,
  text,
  text
) from public;
grant execute on function public.save_community_release_check(
  uuid,
  text,
  text,
  text,
  text
) to authenticated;
revoke all on function public.community_release_ready(uuid) from public;
revoke all on function public.publish_community_after_acceptance(uuid, boolean)
  from public;
grant execute on function public.publish_community_after_acceptance(uuid, boolean)
  to authenticated;

comment on table public.community_release_checks
  is 'Community-specific production acceptance evidence. Never store credentials, private member content, OTPs or payment data.';
comment on function public.community_release_ready(uuid)
  is 'Database-enforced publication gate requiring all eight checks, an active owner and an active backup moderator.';

commit;
