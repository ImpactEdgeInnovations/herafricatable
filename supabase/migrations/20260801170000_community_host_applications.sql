begin;

create table if not exists public.community_host_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references auth.users(id) on delete restrict,
  community_name text not null
    check (char_length(community_name) between 3 and 80),
  proposed_slug text not null
    check (proposed_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category text not null check (
    category in (
      'business_and_career',
      'leadership',
      'investment',
      'technology',
      'creative_industries',
      'wellbeing',
      'social_impact',
      'hobby_and_interest',
      'other'
    )
  ),
  purpose text not null check (char_length(purpose) between 40 and 1200),
  intended_members text not null
    check (char_length(intended_members) between 20 and 600),
  expected_members integer not null check (expected_members between 5 and 100000),
  admission_model text not null check (
    admission_model in ('application_review', 'invitation_only', 'open_request')
  ),
  host_experience text not null
    check (char_length(host_experience) between 20 and 1000),
  safety_plan text not null check (char_length(safety_plan) between 40 and 1200),
  guidelines_accepted_at timestamptz not null,
  status text not null default 'pending' check (
    status in (
      'pending',
      'under_review',
      'changes_requested',
      'approved',
      'declined',
      'withdrawn'
    )
  ),
  applicant_message text,
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_community_id uuid unique
    references public.communities(id) on delete set null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    applicant_message is null
    or char_length(applicant_message) between 10 and 1000
  ),
  check (admin_note is null or char_length(admin_note) between 10 and 2000),
  check (
    (status = 'approved' and created_community_id is not null)
    or status <> 'approved'
  )
);

create index if not exists community_host_applications_admin_idx
  on public.community_host_applications(status, submitted_at);

create index if not exists community_host_applications_member_idx
  on public.community_host_applications(applicant_id, updated_at desc);

create unique index if not exists community_one_open_host_application_idx
  on public.community_host_applications(applicant_id)
  where status in ('pending', 'under_review', 'changes_requested');

alter table public.community_host_applications enable row level security;

drop policy if exists "Members read own community host applications"
  on public.community_host_applications;
create policy "Members read own community host applications"
on public.community_host_applications
for select
to authenticated
using (
  applicant_id = auth.uid()
  or public.is_admin(array['super_admin']::public.app_role[])
);

create or replace function public.community_host_application_slug(
  p_name text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(
    both '-' from regexp_replace(
      regexp_replace(
        lower(trim(coalesce(p_name, ''))),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '-+',
      '-',
      'g'
    )
  );
$$;

create or replace function public.save_community_host_application(
  p_application_id uuid,
  p_community_name text,
  p_category text,
  p_purpose text,
  p_intended_members text,
  p_expected_members integer,
  p_admission_model text,
  p_host_experience text,
  p_safety_plan text,
  p_applicant_message text,
  p_accept_guidelines boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved uuid;
  clean_name text := trim(coalesce(p_community_name, ''));
  clean_slug text := public.community_host_application_slug(p_community_name);
  clean_purpose text := trim(coalesce(p_purpose, ''));
  clean_members text := trim(coalesce(p_intended_members, ''));
  clean_experience text := trim(coalesce(p_host_experience, ''));
  clean_safety text := trim(coalesce(p_safety_plan, ''));
  clean_message text := nullif(trim(coalesce(p_applicant_message, '')), '');
  current_status text;
begin
  if actor is null or not public.is_active_member(actor) then
    raise exception 'Active membership required';
  end if;
  if not coalesce(p_accept_guidelines, false) then
    raise exception 'Accept the Community Guidelines before applying';
  end if;
  if char_length(clean_name) not between 3 and 80
    or char_length(clean_slug) not between 3 and 80
  then
    raise exception 'Choose a community name between 3 and 80 characters';
  end if;
  if p_category not in (
    'business_and_career',
    'leadership',
    'investment',
    'technology',
    'creative_industries',
    'wellbeing',
    'social_impact',
    'hobby_and_interest',
    'other'
  ) then
    raise exception 'Choose a community category';
  end if;
  if char_length(clean_purpose) not between 40 and 1200
    or char_length(clean_members) not between 20 and 600
    or char_length(clean_experience) not between 20 and 1000
    or char_length(clean_safety) not between 40 and 1200
  then
    raise exception 'Complete each host application answer';
  end if;
  if coalesce(p_expected_members, 0) not between 5 and 100000 then
    raise exception 'Expected membership must be between 5 and 100000';
  end if;
  if p_admission_model not in (
    'application_review',
    'invitation_only',
    'open_request'
  ) then
    raise exception 'Choose how members will request access';
  end if;
  if clean_message is not null
    and char_length(clean_message) not between 10 and 1000
  then
    raise exception 'Additional context must be between 10 and 1000 characters';
  end if;

  if p_application_id is null then
    if exists (
      select 1
      from public.community_host_applications application
      where application.applicant_id = actor
        and application.status in (
          'pending',
          'under_review',
          'changes_requested'
        )
    ) then
      raise exception 'You already have a community application in progress';
    end if;

    insert into public.community_host_applications(
      applicant_id,
      community_name,
      proposed_slug,
      category,
      purpose,
      intended_members,
      expected_members,
      admission_model,
      host_experience,
      safety_plan,
      guidelines_accepted_at,
      applicant_message
    )
    values (
      actor,
      clean_name,
      clean_slug,
      p_category,
      clean_purpose,
      clean_members,
      p_expected_members,
      p_admission_model,
      clean_experience,
      clean_safety,
      now(),
      clean_message
    )
    returning id into saved;
  else
    select application.status
    into current_status
    from public.community_host_applications application
    where application.id = p_application_id
      and application.applicant_id = actor
    for update;

    if current_status is null then
      raise exception 'Community application not found';
    end if;
    if current_status not in ('pending', 'changes_requested') then
      raise exception 'This application cannot be edited right now';
    end if;

    update public.community_host_applications
    set community_name = clean_name,
        proposed_slug = clean_slug,
        category = p_category,
        purpose = clean_purpose,
        intended_members = clean_members,
        expected_members = p_expected_members,
        admission_model = p_admission_model,
        host_experience = clean_experience,
        safety_plan = clean_safety,
        guidelines_accepted_at = now(),
        applicant_message = clean_message,
        status = 'pending',
        admin_note = case
          when current_status = 'changes_requested' then admin_note
          else null
        end,
        reviewed_by = null,
        reviewed_at = null,
        submitted_at = now(),
        updated_at = now()
    where id = p_application_id
    returning id into saved;
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
    case
      when p_application_id is null
        then 'community.host_application_submitted'
      else 'community.host_application_resubmitted'
    end,
    'community_host_application',
    saved,
    jsonb_build_object(
      'category', p_category,
      'expected_members', p_expected_members,
      'admission_model', p_admission_model
    )
  );

  return saved;
end;
$$;

create or replace function public.withdraw_community_host_application(
  p_application_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.community_host_applications
  set status = 'withdrawn',
      updated_at = now()
  where id = p_application_id
    and applicant_id = auth.uid()
    and status in ('pending', 'changes_requested');

  if not found then
    raise exception 'This application cannot be withdrawn';
  end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id
  )
  values (
    auth.uid(),
    'community.host_application_withdrawn',
    'community_host_application',
    p_application_id
  );
end;
$$;

create or replace function public.list_my_community_host_applications()
returns table(
  application_id uuid,
  community_name text,
  proposed_slug text,
  category text,
  purpose text,
  intended_members text,
  expected_members integer,
  admission_model text,
  host_experience text,
  safety_plan text,
  applicant_message text,
  status text,
  admin_note text,
  submitted_at timestamptz,
  updated_at timestamptz,
  created_community_id uuid,
  created_community_slug text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    application.id,
    application.community_name,
    application.proposed_slug,
    application.category,
    application.purpose,
    application.intended_members,
    application.expected_members,
    application.admission_model,
    application.host_experience,
    application.safety_plan,
    application.applicant_message,
    application.status,
    application.admin_note,
    application.submitted_at,
    application.updated_at,
    application.created_community_id,
    community.slug
  from public.community_host_applications application
  left join public.communities community
    on community.id = application.created_community_id
  where application.applicant_id = auth.uid()
  order by application.updated_at desc;
end;
$$;

create or replace function public.list_community_host_applications_admin()
returns table(
  application_id uuid,
  applicant_id uuid,
  applicant_name text,
  applicant_email text,
  community_name text,
  proposed_slug text,
  category text,
  purpose text,
  intended_members text,
  expected_members integer,
  admission_model text,
  host_experience text,
  safety_plan text,
  applicant_message text,
  status text,
  admin_note text,
  submitted_at timestamptz,
  updated_at timestamptz,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_community_id uuid,
  created_community_slug text
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
    application.id,
    application.applicant_id,
    coalesce(applicant.display_name, applicant_user.email, 'Member'),
    applicant_user.email,
    application.community_name,
    application.proposed_slug,
    application.category,
    application.purpose,
    application.intended_members,
    application.expected_members,
    application.admission_model,
    application.host_experience,
    application.safety_plan,
    application.applicant_message,
    application.status,
    application.admin_note,
    application.submitted_at,
    application.updated_at,
    reviewer.display_name,
    application.reviewed_at,
    application.created_community_id,
    community.slug
  from public.community_host_applications application
  join auth.users applicant_user on applicant_user.id = application.applicant_id
  left join public.profiles applicant on applicant.id = application.applicant_id
  left join public.profiles reviewer on reviewer.id = application.reviewed_by
  left join public.communities community
    on community.id = application.created_community_id
  order by
    case application.status
      when 'pending' then 0
      when 'under_review' then 1
      when 'changes_requested' then 2
      else 3
    end,
    application.submitted_at;
end;
$$;

create or replace function public.review_community_host_application(
  p_application_id uuid,
  p_action text,
  p_admin_note text,
  p_approved_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_host_applications%rowtype;
  community_id uuid;
  clean_note text := nullif(trim(coalesce(p_admin_note, '')), '');
  clean_slug text := public.community_host_application_slug(p_approved_slug);
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_action not in (
    'start_review',
    'request_changes',
    'decline',
    'approve'
  ) then
    raise exception 'Unsupported application action';
  end if;
  if p_action in ('request_changes', 'decline')
    and char_length(coalesce(clean_note, '')) < 10
  then
    raise exception 'Add a clear note for the applicant';
  end if;
  if clean_note is not null and char_length(clean_note) > 2000 then
    raise exception 'Review note is too long';
  end if;

  select *
  into target
  from public.community_host_applications application
  where application.id = p_application_id
  for update;

  if not found then
    raise exception 'Community application not found';
  end if;
  if target.status in ('approved', 'declined', 'withdrawn') then
    raise exception 'This application is already closed';
  end if;

  if p_action = 'approve' then
    if not public.is_active_member(target.applicant_id) then
      raise exception 'Applicant must remain an active member';
    end if;
    if char_length(clean_slug) not between 3 and 80 then
      raise exception 'Choose a valid community URL';
    end if;
    if exists (
      select 1 from public.communities community
      where community.slug = clean_slug
    ) then
      raise exception 'That community URL is already in use';
    end if;

    insert into public.communities(
      slug,
      name,
      description,
      community_type,
      status,
      created_by
    )
    values (
      clean_slug,
      target.community_name,
      target.purpose,
      'private',
      'draft',
      target.applicant_id
    )
    returning id into community_id;

    insert into public.community_memberships(
      community_id,
      user_id,
      role,
      status,
      invited_by,
      reviewed_by,
      joined_at
    )
    values (
      community_id,
      target.applicant_id,
      'owner',
      'active',
      actor,
      actor,
      now()
    );

    update public.community_host_applications
    set status = 'approved',
        admin_note = clean_note,
        reviewed_by = actor,
        reviewed_at = now(),
        created_community_id = community_id,
        updated_at = now()
    where id = p_application_id;
  else
    update public.community_host_applications
    set status = case p_action
          when 'start_review' then 'under_review'
          when 'request_changes' then 'changes_requested'
          else 'declined'
        end,
        admin_note = clean_note,
        reviewed_by = actor,
        reviewed_at = now(),
        updated_at = now()
    where id = p_application_id;
  end if;

  perform public.enqueue_notification(
    target.applicant_id,
    'network',
    case p_action
      when 'approve' then 'Your community is ready to prepare'
      when 'request_changes' then 'Your community application needs an update'
      when 'decline' then 'Community application reviewed'
      else 'Community application review started'
    end,
    case p_action
      when 'approve'
        then 'Your application was approved. Your private draft room is ready for setup and release checks.'
      when 'request_changes'
        then 'The Community team left guidance for your application. Review it and resubmit when ready.'
      when 'decline'
        then 'The Community team completed its review. Open Community to read the decision.'
      else 'The Community team has started reviewing your application.'
    end,
    '/communities',
    'community-host-application:' || p_application_id || ':' || p_action
  );

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'community.host_application_' || p_action,
    'community_host_application',
    p_application_id,
    jsonb_build_object(
      'applicant_id', target.applicant_id,
      'community_id', community_id,
      'has_note', clean_note is not null
    )
  );

  return community_id;
end;
$$;

revoke all on table public.community_host_applications from public;
grant select on table public.community_host_applications to authenticated;

revoke all on function public.community_host_application_slug(text) from public;

revoke all on function public.save_community_host_application(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  boolean
) from public;
grant execute on function public.save_community_host_application(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  boolean
) to authenticated;

revoke all on function public.withdraw_community_host_application(uuid)
  from public;
grant execute on function public.withdraw_community_host_application(uuid)
  to authenticated;

revoke all on function public.list_my_community_host_applications()
  from public;
grant execute on function public.list_my_community_host_applications()
  to authenticated;

revoke all on function public.list_community_host_applications_admin()
  from public;
grant execute on function public.list_community_host_applications_admin()
  to authenticated;

revoke all on function public.review_community_host_application(
  uuid,
  text,
  text,
  text
) from public;
grant execute on function public.review_community_host_application(
  uuid,
  text,
  text,
  text
) to authenticated;

commit;
