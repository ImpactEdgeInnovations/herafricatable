begin;

create table public.community_cohorts (
  community_id uuid primary key references public.communities(id) on delete cascade,
  event_id uuid unique references public.events(id) on delete set null,
  eligibility_scope text not null default 'confirmed_event'
    check (eligibility_scope in ('active_members', 'confirmed_event')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'read_only')),
  welcome_message text not null
    check (char_length(welcome_message) between 20 and 1200),
  introduction_prompt text not null
    check (char_length(introduction_prompt) between 20 and 800),
  follow_up_until timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_introductions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity text not null check (char_length(identity) between 2 and 600),
  building text not null check (char_length(building) between 2 and 600),
  can_offer text not null check (char_length(can_offer) between 2 and 600),
  seeking text not null check (char_length(seeking) between 2 and 600),
  status text not null default 'published'
    check (status in ('published', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, user_id)
);

create index community_cohorts_status_idx
  on public.community_cohorts(status, follow_up_until);
create index community_introductions_feed_idx
  on public.community_introductions(community_id, status, updated_at desc);

alter table public.community_cohorts enable row level security;
alter table public.community_introductions enable row level security;

create or replace function public.notify_member_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.access_status = 'pending'
    and new.access_status in ('onboarding', 'active') then
    perform public.enqueue_notification(
      new.id,
      'system',
      'Welcome to Her Africa Table',
      case
        when new.access_status = 'onboarding'
          then 'Your membership request has been approved. Complete your profile to enter the trusted member network.'
        else 'Your membership is active. Your Member Home will guide your first steps into the network.'
      end,
      case when new.access_status = 'onboarding' then '/onboarding' else '/home' end,
      'member-approved:' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_member_approval_trigger on public.profiles;
create trigger notify_member_approval_trigger
after update of access_status on public.profiles
for each row execute function public.notify_member_approval();

create policy "Cohort members read room configuration"
  on public.community_cohorts for select to authenticated
  using (
    public.can_manage_community(community_id)
    or exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = community_cohorts.community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );

create policy "Cohort members read introductions"
  on public.community_introductions for select to authenticated
  using (
    exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = community_introductions.community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
    and status = 'published'
  );

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

  select title, ends_at
  into event_title, event_end
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
    insert into public.communities (
      slug, name, description, community_type, status, created_by
    )
    values (
      'founding-table-nairobi',
      'The Founding Table — Nairobi',
      'A private, hosted room where confirmed founding guests can introduce themselves, exchange useful asks and offers, and continue relationships after the Nairobi table.',
      'private',
      'published',
      actor
    )
    returning id into saved;

    insert into public.community_memberships (
      community_id, user_id, role, status, invited_by, reviewed_by, joined_at
    )
    values (saved, actor, 'owner', 'active', actor, actor, now());
  end if;

  insert into public.community_cohorts (
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

  update public.feature_flags
  set enabled = true, updated_by = actor, updated_at = now()
  where key = 'communities';

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  )
  values (
    actor,
    'cohort.founding_room_ensured',
    'community',
    saved,
    jsonb_build_object('event_id', p_event_id, 'event_title', event_title)
  );

  return saved;
end;
$$;

create or replace function public.save_cohort_configuration(
  p_community_id uuid,
  p_event_id uuid,
  p_eligibility_scope text,
  p_status text,
  p_welcome_message text,
  p_introduction_prompt text,
  p_follow_up_until timestamptz
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
  if p_eligibility_scope not in ('active_members', 'confirmed_event')
    or p_status not in ('draft', 'active', 'read_only') then
    raise exception 'Unsupported cohort configuration';
  end if;
  if p_eligibility_scope = 'confirmed_event' and p_event_id is null then
    raise exception 'Choose an event for attendee eligibility';
  end if;
  if char_length(trim(coalesce(p_welcome_message, ''))) not between 20 and 1200
    or char_length(trim(coalesce(p_introduction_prompt, ''))) not between 20 and 800 then
    raise exception 'Welcome message and introduction prompt are required';
  end if;

  insert into public.community_cohorts (
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
    p_community_id,
    p_event_id,
    p_eligibility_scope,
    p_status,
    trim(p_welcome_message),
    trim(p_introduction_prompt),
    p_follow_up_until,
    auth.uid()
  )
  on conflict (community_id) do update
  set event_id = excluded.event_id,
      eligibility_scope = excluded.eligibility_scope,
      status = excluded.status,
      welcome_message = excluded.welcome_message,
      introduction_prompt = excluded.introduction_prompt,
      follow_up_until = excluded.follow_up_until,
      updated_at = now();

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  )
  values (
    auth.uid(),
    'cohort.configuration_saved',
    'community',
    p_community_id,
    jsonb_build_object(
      'event_id', p_event_id,
      'eligibility_scope', p_eligibility_scope,
      'status', p_status,
      'follow_up_until', p_follow_up_until
    )
  );
end;
$$;

create or replace function public.sync_cohort_invitations(p_community_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cohort public.community_cohorts%rowtype;
  candidate record;
  created_count integer := 0;
  membership_id uuid;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;

  select * into cohort
  from public.community_cohorts
  where community_id = p_community_id
  for update;
  if not found or cohort.status = 'draft' then
    raise exception 'An active cohort configuration is required';
  end if;

  for candidate in
    select profile.id as user_id
    from public.profiles profile
    where profile.access_status = 'active'
      and not profile.visibility_paused
      and (
        cohort.eligibility_scope = 'active_members'
        or exists (
          select 1
          from public.event_memberships event_member
          where event_member.event_id = cohort.event_id
            and event_member.user_id = profile.id
            and event_member.status in ('confirmed', 'attended')
        )
      )
      and not exists (
        select 1
        from public.community_memberships membership
        where membership.community_id = p_community_id
          and membership.user_id = profile.id
      )
  loop
    insert into public.community_memberships (
      community_id, user_id, role, status, invited_by
    )
    values (p_community_id, candidate.user_id, 'member', 'invited', auth.uid())
    returning id into membership_id;

    perform public.enqueue_notification(
      candidate.user_id,
      'community',
      'Your Founding Table invitation',
      'You are eligible to join the private Nairobi founding room. Review the invitation and choose whether to enter.',
      '/communities',
      'cohort-invitation:' || membership_id
    );
    created_count := created_count + 1;
  end loop;

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  )
  values (
    auth.uid(),
    'cohort.invitations_synced',
    'community',
    p_community_id,
    jsonb_build_object('invited_count', created_count)
  );
  return created_count;
end;
$$;

create or replace function public.get_community_cohort(p_community_id uuid)
returns table (
  community_id uuid,
  event_id uuid,
  event_slug text,
  event_title text,
  cohort_status text,
  welcome_message text,
  introduction_prompt text,
  follow_up_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.community_memberships
    where community_memberships.community_id = p_community_id
      and user_id = auth.uid()
      and status = 'active'
  ) and not public.can_manage_community(p_community_id) then
    raise exception 'Active community membership required';
  end if;
  return query
  select cohort.community_id,
         cohort.event_id,
         event.slug,
         event.title,
         case
           when cohort.follow_up_until is not null and cohort.follow_up_until <= now()
             then 'read_only'
           else cohort.status
         end,
         cohort.welcome_message,
         cohort.introduction_prompt,
         cohort.follow_up_until
  from public.community_cohorts cohort
  left join public.events event on event.id = cohort.event_id
  where cohort.community_id = p_community_id;
end;
$$;

create or replace function public.save_community_introduction(
  p_community_id uuid,
  p_identity text,
  p_building text,
  p_can_offer text,
  p_seeking text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved uuid;
  cohort_status text;
begin
  if not public.is_active_member(auth.uid())
    or not exists (
      select 1
      from public.community_memberships
      where community_id = p_community_id
        and user_id = auth.uid()
        and status = 'active'
    ) then
    raise exception 'Active community membership required';
  end if;
  select status into cohort_status
  from public.community_cohorts
  where community_id = p_community_id;
  if cohort_status is null
    or cohort_status <> 'active'
    or exists (
      select 1 from public.community_cohorts
      where community_id = p_community_id
        and follow_up_until is not null
        and follow_up_until <= now()
    ) then
    raise exception 'Introductions are not open';
  end if;
  if char_length(trim(coalesce(p_identity, ''))) not between 2 and 600
    or char_length(trim(coalesce(p_building, ''))) not between 2 and 600
    or char_length(trim(coalesce(p_can_offer, ''))) not between 2 and 600
    or char_length(trim(coalesce(p_seeking, ''))) not between 2 and 600 then
    raise exception 'Complete all four introduction prompts';
  end if;

  insert into public.community_introductions (
    community_id, user_id, identity, building, can_offer, seeking
  )
  values (
    p_community_id,
    auth.uid(),
    trim(p_identity),
    trim(p_building),
    trim(p_can_offer),
    trim(p_seeking)
  )
  on conflict (community_id, user_id) do update
  set identity = excluded.identity,
      building = excluded.building,
      can_offer = excluded.can_offer,
      seeking = excluded.seeking,
      status = 'published',
      updated_at = now()
  returning id into saved;

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  )
  values (
    auth.uid(),
    'cohort.introduction_saved',
    'community_introduction',
    saved,
    jsonb_build_object('community_id', p_community_id)
  );
  return saved;
end;
$$;

create or replace function public.list_community_introductions(p_community_id uuid)
returns table (
  introduction_id uuid,
  user_id uuid,
  display_name text,
  job_title text,
  company text,
  identity text,
  building text,
  can_offer text,
  seeking text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.community_memberships
    where community_id = p_community_id
      and user_id = auth.uid()
      and status = 'active'
  ) then
    raise exception 'Active community membership required';
  end if;
  return query
  select introduction.id,
         introduction.user_id,
         profile.display_name,
         profile.job_title,
         profile.company,
         introduction.identity,
         introduction.building,
         introduction.can_offer,
         introduction.seeking,
         introduction.updated_at
  from public.community_introductions introduction
  join public.profiles profile on profile.id = introduction.user_id
  where introduction.community_id = p_community_id
    and introduction.status = 'published'
    and public.is_active_member(introduction.user_id)
    and not public.is_blocked_pair(auth.uid(), introduction.user_id)
  order by introduction.updated_at desc;
end;
$$;

create or replace function public.get_my_activation_journey()
returns table (
  profile_complete boolean,
  guidelines_accepted boolean,
  cohort_id uuid,
  cohort_slug text,
  cohort_name text,
  cohort_membership_status text,
  introduction_complete boolean,
  accepted_connections bigint,
  confirmed_events bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active membership required';
  end if;
  return query
  with preferred_cohort as (
    select community.id, community.slug, community.name, membership.status
    from public.community_cohorts cohort
    join public.communities community on community.id = cohort.community_id
    left join public.community_memberships membership
      on membership.community_id = community.id
     and membership.user_id = auth.uid()
    where cohort.status in ('active', 'read_only')
      and membership.status in ('invited', 'active')
    order by case membership.status when 'active' then 0 else 1 end,
             cohort.created_at desc
    limit 1
  )
  select
    profile.profile_completion = 100 and profile.onboarding_completed_at is not null,
    exists (
      select 1 from public.consent_records consent
      where consent.user_id = auth.uid()
        and consent.document_type = 'community_guidelines'
    ),
    preferred.id,
    preferred.slug,
    preferred.name,
    preferred.status,
    exists (
      select 1 from public.community_introductions introduction
      where introduction.community_id = preferred.id
        and introduction.user_id = auth.uid()
        and introduction.status = 'published'
    ),
    (
      select count(*)
      from public.connections connection
      where connection.status = 'accepted'
        and auth.uid() in (connection.user_low, connection.user_high)
    ),
    (
      select count(*)
      from public.event_memberships event_member
      where event_member.user_id = auth.uid()
        and event_member.status in ('confirmed', 'attended')
    )
  from public.profiles profile
  left join preferred_cohort preferred on true
  where profile.id = auth.uid();
end;
$$;

create or replace function public.list_cohort_overview()
returns table (
  community_id uuid,
  community_name text,
  community_slug text,
  event_id uuid,
  event_title text,
  cohort_status text,
  eligibility_scope text,
  welcome_message text,
  introduction_prompt text,
  follow_up_until timestamptz,
  invited_count bigint,
  active_count bigint,
  introduction_count bigint
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
  select cohort.community_id,
         community.name,
         community.slug,
         cohort.event_id,
         event.title,
         case
           when cohort.follow_up_until is not null and cohort.follow_up_until <= now()
             then 'read_only'
           else cohort.status
         end,
         cohort.eligibility_scope,
         cohort.welcome_message,
         cohort.introduction_prompt,
         cohort.follow_up_until,
         (select count(*) from public.community_memberships membership where membership.community_id = cohort.community_id and membership.status = 'invited'),
         (select count(*) from public.community_memberships membership where membership.community_id = cohort.community_id and membership.status = 'active'),
         (select count(*) from public.community_introductions introduction where introduction.community_id = cohort.community_id and introduction.status = 'published')
  from public.community_cohorts cohort
  join public.communities community on community.id = cohort.community_id
  left join public.events event on event.id = cohort.event_id
  order by cohort.created_at desc;
end;
$$;

create or replace function public.list_cohort_health(p_community_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  profile_completion smallint,
  membership_status text,
  introduction_complete boolean,
  accepted_connections bigint,
  event_status text,
  joined_at timestamptz
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
  select membership.user_id,
         auth_user.email::text,
         profile.display_name,
         profile.profile_completion,
         membership.status,
         exists (
           select 1 from public.community_introductions introduction
           where introduction.community_id = membership.community_id
             and introduction.user_id = membership.user_id
             and introduction.status = 'published'
         ),
         (
           select count(*)
           from public.connections connection
           where connection.status = 'accepted'
             and membership.user_id in (connection.user_low, connection.user_high)
         ),
         event_member.status,
         membership.joined_at
  from public.community_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  join auth.users auth_user on auth_user.id = membership.user_id
  join public.community_cohorts cohort on cohort.community_id = membership.community_id
  left join public.event_memberships event_member
    on event_member.event_id = cohort.event_id
   and event_member.user_id = membership.user_id
  where membership.community_id = p_community_id
    and membership.role <> 'owner'
  order by case membership.status when 'invited' then 0 when 'active' then 1 else 2 end,
           profile.display_name;
end;
$$;

create or replace function public.create_community_post(
  p_community_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved uuid;
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor)
    or not exists (
      select 1 from public.community_memberships
      where community_id = p_community_id
        and user_id = actor
        and status = 'active'
    ) then
    raise exception 'Active community membership required';
  end if;
  if exists (
    select 1 from public.community_cohorts
    where community_id = p_community_id
      and (
        status <> 'active'
        or (follow_up_until is not null and follow_up_until <= now())
      )
  ) then
    raise exception 'This cohort room is read only';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 2 and 3000 then
    raise exception 'Post must be between 2 and 3000 characters';
  end if;
  if (
    select count(*) from public.community_posts
    where author_id = actor
      and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'Hourly community post limit reached';
  end if;
  insert into public.community_posts(community_id, author_id, body)
  values (p_community_id, actor, trim(p_body))
  returning id into saved;
  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  )
  values (
    actor,
    'community.post_created',
    'community_post',
    saved,
    jsonb_build_object('community_id', p_community_id)
  );
  return saved;
end;
$$;

revoke all on function public.ensure_founding_cohort(uuid) from public;
grant execute on function public.ensure_founding_cohort(uuid) to authenticated;
revoke all on function public.save_cohort_configuration(uuid, uuid, text, text, text, text, timestamptz) from public;
grant execute on function public.save_cohort_configuration(uuid, uuid, text, text, text, text, timestamptz) to authenticated;
revoke all on function public.sync_cohort_invitations(uuid) from public;
grant execute on function public.sync_cohort_invitations(uuid) to authenticated;
revoke all on function public.get_community_cohort(uuid) from public;
grant execute on function public.get_community_cohort(uuid) to authenticated;
revoke all on function public.save_community_introduction(uuid, text, text, text, text) from public;
grant execute on function public.save_community_introduction(uuid, text, text, text, text) to authenticated;
revoke all on function public.list_community_introductions(uuid) from public;
grant execute on function public.list_community_introductions(uuid) to authenticated;
revoke all on function public.get_my_activation_journey() from public;
grant execute on function public.get_my_activation_journey() to authenticated;
revoke all on function public.list_cohort_overview() from public;
grant execute on function public.list_cohort_overview() to authenticated;
revoke all on function public.list_cohort_health(uuid) from public;
grant execute on function public.list_cohort_health(uuid) to authenticated;

comment on table public.community_cohorts is
  'Hosted cohort-room controls. Eligibility creates consent-based invitations and never automatic private access.';
comment on table public.community_introductions is
  'Structured member introductions visible only inside an accepted cohort membership and filtered for blocked pairs.';
comment on function public.sync_cohort_invitations is
  'Creates invitations for currently eligible members without converting invitations into active access.';

commit;
