begin;

create table if not exists public.member_event_proposals (
  id uuid primary key default gen_random_uuid(),
  proposed_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 4 and 140),
  summary text not null check (char_length(trim(summary)) between 40 and 2000),
  format text not null check (format in ('in_person', 'virtual', 'hybrid')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Africa/Nairobi'
    check (char_length(trim(timezone)) between 3 and 80),
  venue_name text,
  city text,
  country text not null default 'Kenya',
  address_line text,
  map_url text,
  online_url text,
  capacity integer not null check (capacity between 5 and 500),
  audience text not null default 'public' check (audience = 'public'),
  pricing_mode text not null default 'free' check (pricing_mode = 'free'),
  price_minor bigint not null default 0 check (price_minor = 0),
  currency text not null default 'KES' check (currency = 'KES'),
  safety_contact_name text not null
    check (char_length(trim(safety_contact_name)) between 2 and 120),
  safety_contact_phone text not null
    check (char_length(trim(safety_contact_phone)) between 7 and 40),
  accessibility_notes text
    check (accessibility_notes is null or char_length(accessibility_notes) <= 1200),
  host_experience text not null
    check (char_length(trim(host_experience)) between 20 and 1200),
  host_note text check (host_note is null or char_length(host_note) <= 1200),
  community_after_event boolean not null default false,
  community_idea text check (
    community_idea is null or char_length(trim(community_idea)) between 20 and 800
  ),
  status text not null default 'draft' check (
    status in (
      'draft', 'submitted', 'under_review', 'changes_requested',
      'approved', 'declined', 'cancelled'
    )
  ),
  canonical_event_id uuid unique references public.events(id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 1200),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_event_proposal_time_order check (ends_at > starts_at),
  constraint member_event_proposal_location check (
    format = 'virtual'
    or (
      nullif(trim(coalesce(venue_name, '')), '') is not null
      and nullif(trim(coalesce(city, '')), '') is not null
    )
  ),
  constraint member_event_proposal_online check (
    format = 'in_person'
    or nullif(trim(coalesce(online_url, '')), '') is not null
  ),
  constraint member_event_proposal_follow_up check (
    not community_after_event
    or char_length(trim(coalesce(community_idea, ''))) between 20 and 800
  )
);

create index if not exists member_event_proposals_member_idx
  on public.member_event_proposals(proposed_by, updated_at desc);
create index if not exists member_event_proposals_review_idx
  on public.member_event_proposals(status, submitted_at, updated_at desc);

alter table public.member_event_proposals enable row level security;

drop policy if exists "Members read own public event proposals"
  on public.member_event_proposals;
create policy "Members read own public event proposals"
  on public.member_event_proposals for select to authenticated
  using (
    proposed_by = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  );

create table if not exists public.event_follow_up_interests (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  interested boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_follow_up_interests enable row level security;

drop policy if exists "Members read own event follow up choice"
  on public.event_follow_up_interests;
create policy "Members read own event follow up choice"
  on public.event_follow_up_interests for select to authenticated
  using (user_id = auth.uid());

create or replace function public.save_member_event_proposal(
  p_proposal_id uuid,
  p_title text,
  p_summary text,
  p_format text,
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
  p_safety_contact_name text,
  p_safety_contact_phone text,
  p_accessibility_notes text,
  p_host_experience text,
  p_host_note text,
  p_community_after_event boolean,
  p_community_idea text,
  p_submit boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved uuid := p_proposal_id;
  target public.member_event_proposals%rowtype;
  next_status text := case when coalesce(p_submit, false) then 'submitted' else 'draft' end;
  clean_community_idea text := nullif(trim(coalesce(p_community_idea, '')), '');
begin
  if actor is null or not public.is_active_member(actor) then
    raise exception 'Active membership required';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 4 and 140 then
    raise exception 'Enter a clear event name';
  end if;
  if char_length(trim(coalesce(p_summary, ''))) not between 40 and 2000 then
    raise exception 'Tell us clearly what the gathering is for';
  end if;
  if p_format not in ('in_person', 'virtual', 'hybrid') then
    raise exception 'Choose an event format';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'End time must follow start time'; end if;
  if p_ends_at > p_starts_at + interval '7 days' then
    raise exception 'An event cannot run longer than seven days';
  end if;
  if coalesce(p_submit, false) and p_starts_at < now() + interval '7 days' then
    raise exception 'Public event proposals need at least seven days for review';
  end if;
  if p_capacity not between 5 and 500 then
    raise exception 'Capacity must be between 5 and 500 people';
  end if;
  if p_format in ('in_person', 'hybrid') and (
    nullif(trim(coalesce(p_venue_name, '')), '') is null
    or nullif(trim(coalesce(p_city, '')), '') is null
  ) then
    raise exception 'Add the venue and city';
  end if;
  if p_format in ('virtual', 'hybrid')
    and nullif(trim(coalesce(p_online_url, '')), '') is null then
    raise exception 'Add the private online event link';
  end if;
  if nullif(trim(coalesce(p_online_url, '')), '') is not null
    and trim(p_online_url) !~* '^https://' then
    raise exception 'Online event link must begin with https://';
  end if;
  if nullif(trim(coalesce(p_map_url, '')), '') is not null
    and trim(p_map_url) !~* '^https://' then
    raise exception 'Map link must begin with https://';
  end if;
  if char_length(trim(coalesce(p_safety_contact_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_safety_contact_phone, ''))) not between 7 and 40 then
    raise exception 'Add a responsible event contact and phone number';
  end if;
  if char_length(trim(coalesce(p_host_experience, ''))) not between 20 and 1200 then
    raise exception 'Tell us how you will responsibly host this event';
  end if;
  if coalesce(p_community_after_event, false)
    and char_length(coalesce(clean_community_idea, '')) not between 20 and 800 then
    raise exception 'Describe the possible follow-up Community';
  end if;

  if p_proposal_id is null then
    if (
      select count(*)
      from public.member_event_proposals proposal
      where proposal.proposed_by = actor
        and proposal.status in ('draft', 'submitted', 'under_review', 'changes_requested')
    ) >= 3 then
      raise exception 'Finish an existing event proposal before starting another';
    end if;

    insert into public.member_event_proposals (
      proposed_by, title, summary, format, starts_at, ends_at, timezone,
      venue_name, city, country, address_line, map_url, online_url, capacity,
      safety_contact_name, safety_contact_phone, accessibility_notes,
      host_experience, host_note, community_after_event, community_idea,
      status, submitted_at
    ) values (
      actor, trim(p_title), trim(p_summary), p_format, p_starts_at, p_ends_at,
      coalesce(nullif(trim(p_timezone), ''), 'Africa/Nairobi'),
      nullif(trim(coalesce(p_venue_name, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      coalesce(nullif(trim(coalesce(p_country, '')), ''), 'Kenya'),
      nullif(trim(coalesce(p_address_line, '')), ''),
      nullif(trim(coalesce(p_map_url, '')), ''),
      nullif(trim(coalesce(p_online_url, '')), ''),
      p_capacity, trim(p_safety_contact_name), trim(p_safety_contact_phone),
      nullif(trim(coalesce(p_accessibility_notes, '')), ''),
      trim(p_host_experience), nullif(trim(coalesce(p_host_note, '')), ''),
      coalesce(p_community_after_event, false), clean_community_idea,
      next_status, case when coalesce(p_submit, false) then now() else null end
    ) returning id into saved;
  else
    select * into target
    from public.member_event_proposals
    where id = p_proposal_id and proposed_by = actor
    for update;
    if not found then raise exception 'Event proposal not found'; end if;
    if target.status not in ('draft', 'changes_requested') then
      raise exception 'This proposal is already with the review team';
    end if;

    update public.member_event_proposals
    set title = trim(p_title),
        summary = trim(p_summary),
        format = p_format,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        timezone = coalesce(nullif(trim(p_timezone), ''), 'Africa/Nairobi'),
        venue_name = nullif(trim(coalesce(p_venue_name, '')), ''),
        city = nullif(trim(coalesce(p_city, '')), ''),
        country = coalesce(nullif(trim(coalesce(p_country, '')), ''), 'Kenya'),
        address_line = nullif(trim(coalesce(p_address_line, '')), ''),
        map_url = nullif(trim(coalesce(p_map_url, '')), ''),
        online_url = nullif(trim(coalesce(p_online_url, '')), ''),
        capacity = p_capacity,
        safety_contact_name = trim(p_safety_contact_name),
        safety_contact_phone = trim(p_safety_contact_phone),
        accessibility_notes = nullif(trim(coalesce(p_accessibility_notes, '')), ''),
        host_experience = trim(p_host_experience),
        host_note = nullif(trim(coalesce(p_host_note, '')), ''),
        community_after_event = coalesce(p_community_after_event, false),
        community_idea = clean_community_idea,
        status = next_status,
        submitted_at = case when coalesce(p_submit, false) then now() else submitted_at end,
        review_note = case when coalesce(p_submit, false) then null else review_note end,
        reviewed_by = case when coalesce(p_submit, false) then null else reviewed_by end,
        reviewed_at = case when coalesce(p_submit, false) then null else reviewed_at end,
        updated_at = now()
    where id = p_proposal_id;
  end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor,
    case when coalesce(p_submit, false)
      then 'event.member_proposal_submitted'
      else 'event.member_proposal_saved'
    end,
    'member_event_proposal',
    saved,
    jsonb_build_object(
      'format', p_format,
      'audience', 'public',
      'free', true,
      'community_after_event', coalesce(p_community_after_event, false)
    )
  );
  return saved;
end;
$$;

create or replace function public.cancel_member_event_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.member_event_proposals
  set status = 'cancelled', updated_at = now()
  where id = p_proposal_id
    and proposed_by = auth.uid()
    and status in ('draft', 'submitted', 'changes_requested');
  if not found then raise exception 'This event proposal cannot be cancelled'; end if;
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), 'event.member_proposal_cancelled', 'member_event_proposal', p_proposal_id);
end;
$$;

create or replace function public.list_my_member_event_proposals()
returns table(
  proposal_id uuid,
  title text,
  summary text,
  format text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  venue_name text,
  city text,
  country text,
  address_line text,
  map_url text,
  online_url text,
  capacity integer,
  safety_contact_name text,
  safety_contact_phone text,
  accessibility_notes text,
  host_experience text,
  host_note text,
  community_after_event boolean,
  community_idea text,
  status text,
  canonical_event_id uuid,
  canonical_event_slug text,
  review_note text,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    proposal.id, proposal.title, proposal.summary, proposal.format,
    proposal.starts_at, proposal.ends_at, proposal.timezone,
    proposal.venue_name, proposal.city, proposal.country,
    proposal.address_line, proposal.map_url, proposal.online_url,
    proposal.capacity, proposal.safety_contact_name,
    proposal.safety_contact_phone, proposal.accessibility_notes,
    proposal.host_experience, proposal.host_note,
    proposal.community_after_event, proposal.community_idea,
    proposal.status, proposal.canonical_event_id, event.slug,
    proposal.review_note, proposal.submitted_at,
    proposal.created_at, proposal.updated_at
  from public.member_event_proposals proposal
  left join public.events event on event.id = proposal.canonical_event_id
  where proposal.proposed_by = auth.uid()
  order by
    case proposal.status
      when 'changes_requested' then 0
      when 'draft' then 1
      when 'submitted' then 2
      when 'under_review' then 3
      when 'approved' then 4
      else 5
    end,
    proposal.updated_at desc;
$$;

create or replace function public.list_admin_member_event_proposals()
returns table(
  proposal_id uuid,
  proposed_by uuid,
  proposer_name text,
  proposer_email text,
  title text,
  summary text,
  format text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  venue_name text,
  city text,
  country text,
  address_line text,
  map_url text,
  online_url text,
  capacity integer,
  safety_contact_name text,
  safety_contact_phone text,
  accessibility_notes text,
  host_experience text,
  host_note text,
  community_after_event boolean,
  community_idea text,
  status text,
  canonical_event_id uuid,
  canonical_event_slug text,
  review_note text,
  follow_up_interest_count bigint,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin access required';
  end if;
  return query
  select
    proposal.id, proposal.proposed_by, profile.display_name,
    account.email::text, proposal.title, proposal.summary, proposal.format,
    proposal.starts_at, proposal.ends_at, proposal.timezone,
    proposal.venue_name, proposal.city, proposal.country,
    proposal.address_line, proposal.map_url, proposal.online_url,
    proposal.capacity, proposal.safety_contact_name,
    proposal.safety_contact_phone, proposal.accessibility_notes,
    proposal.host_experience, proposal.host_note,
    proposal.community_after_event, proposal.community_idea,
    proposal.status, proposal.canonical_event_id, event.slug,
    proposal.review_note,
    (select count(*) from public.event_follow_up_interests interest
      where interest.event_id = proposal.canonical_event_id and interest.interested),
    proposal.submitted_at, proposal.created_at, proposal.updated_at
  from public.member_event_proposals proposal
  join auth.users account on account.id = proposal.proposed_by
  left join public.profiles profile on profile.id = proposal.proposed_by
  left join public.events event on event.id = proposal.canonical_event_id
  order by
    case proposal.status
      when 'submitted' then 0
      when 'under_review' then 1
      when 'changes_requested' then 2
      when 'approved' then 3
      else 4
    end,
    proposal.submitted_at nulls last,
    proposal.updated_at desc;
end;
$$;

create or replace function public.review_member_event_proposal(
  p_proposal_id uuid,
  p_action text,
  p_review_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.member_event_proposals%rowtype;
  saved_venue uuid;
  saved_event uuid;
  saved_slug text;
  next_status text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin access required';
  end if;
  if p_action not in ('start_review', 'request_changes', 'approve', 'decline') then
    raise exception 'Unsupported review action';
  end if;
  if p_action in ('request_changes', 'decline')
    and char_length(trim(coalesce(p_review_note, ''))) < 10 then
    raise exception 'Add a clear review note';
  end if;

  select * into target from public.member_event_proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'Event proposal not found'; end if;
  if p_action = 'approve' and target.status = 'approved'
    and target.canonical_event_id is not null then
    return target.canonical_event_id;
  end if;
  if target.status not in ('submitted', 'under_review') then
    raise exception 'Only a submitted event proposal can be reviewed';
  end if;

  if p_action = 'approve' then
    if target.audience <> 'public' or target.pricing_mode <> 'free'
      or target.price_minor <> 0 then
      raise exception 'Only free public member events are open for this launch tier';
    end if;
    if target.starts_at < now() + interval '72 hours' then
      raise exception 'The event is too close to approve safely';
    end if;
    if not public.is_active_member(target.proposed_by) then
      raise exception 'The event proposer must remain an active member';
    end if;

    if target.format in ('in_person', 'hybrid') then
      insert into public.venues(name, city, country, address_line, map_url)
      values (
        trim(target.venue_name), trim(target.city), target.country,
        nullif(trim(coalesce(target.address_line, '')), ''),
        nullif(trim(coalesce(target.map_url, '')), '')
      ) returning id into saved_venue;
    end if;

    saved_slug := lower(regexp_replace(trim(target.title), '[^a-zA-Z0-9]+', '-', 'g'));
    saved_slug := trim(both '-' from saved_slug) || '-' ||
      to_char(target.starts_at at time zone target.timezone, 'YYYY-MM-DD') ||
      '-' || left(target.id::text, 8);

    insert into public.events(
      slug, title, summary, format, status, starts_at, ends_at, timezone,
      venue_id, capacity, registration_mode, is_featured, audience,
      created_by, updated_by
    ) values (
      saved_slug, trim(target.title), trim(target.summary), target.format,
      'published', target.starts_at, target.ends_at, target.timezone,
      saved_venue, target.capacity, 'manual_review', false, 'public',
      target.proposed_by, actor
    ) returning id into saved_event;

    insert into public.event_private_details(event_id, online_url, check_in_instructions)
    values (
      saved_event,
      nullif(trim(coalesce(target.online_url, '')), ''),
      'Follow the event team instructions. Escalate any safety concern through Her Africa Table support.'
    );

    insert into public.ticket_types(
      event_id, name, description, price_minor, currency, inventory_quantity,
      sales_start_at, sales_end_at, status, sort_order
    ) values (
      saved_event, 'Complimentary place',
      'A complimentary place at this member-hosted public event.',
      0, 'KES', target.capacity, now(), target.starts_at, 'on_sale', 0
    );

    update public.member_event_proposals
    set status = 'approved', canonical_event_id = saved_event,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_by = actor, reviewed_at = now(), updated_at = now()
    where id = target.id;

    perform public.enqueue_notification(
      target.proposed_by, 'event', 'Your event is approved',
      target.title || ' is now public. Her Africa Table will continue to manage registration and safety review.',
      '/events/' || saved_slug, 'member-event-approved:' || target.id
    );
    next_status := 'approved';
  else
    next_status := case p_action
      when 'start_review' then 'under_review'
      when 'request_changes' then 'changes_requested'
      else 'declined'
    end;
    update public.member_event_proposals
    set status = next_status,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_by = actor, reviewed_at = now(), updated_at = now()
    where id = target.id;
    if p_action in ('request_changes', 'decline') then
      perform public.enqueue_notification(
        target.proposed_by, 'event',
        case when p_action = 'request_changes'
          then 'Your event proposal needs an update'
          else 'An update on your event proposal'
        end,
        case when p_action = 'request_changes'
          then 'The review team left guidance. Open Events to update and resend your proposal.'
          else 'The review team could not approve this proposal. Open Events to read the decision note.'
        end,
        '/events#propose-event',
        'member-event-review:' || target.id || ':' || next_status
      );
    end if;
    saved_event := null;
  end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'event.member_proposal_' || p_action, 'member_event_proposal', target.id,
    jsonb_build_object(
      'status', next_status, 'canonical_event_id', saved_event,
      'audience', 'public', 'pricing_mode', 'free',
      'community_after_event', target.community_after_event
    )
  );
  return saved_event;
end;
$$;

create or replace function public.get_my_event_follow_up_interest(p_event_id uuid)
returns table(available boolean, interested boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.member_event_proposals proposal
      join public.events event on event.id = proposal.canonical_event_id
      where event.id = p_event_id and event.status = 'published'
        and proposal.status = 'approved' and proposal.community_after_event
    ),
    coalesce((
      select interest.interested from public.event_follow_up_interests interest
      where interest.event_id = p_event_id and interest.user_id = auth.uid()
    ), false);
$$;

create or replace function public.set_my_event_follow_up_interest(
  p_event_id uuid,
  p_interested boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.member_event_proposals proposal
    join public.events event on event.id = proposal.canonical_event_id
    join public.event_memberships membership
      on membership.event_id = event.id and membership.user_id = auth.uid()
    where event.id = p_event_id and event.status = 'published'
      and proposal.status = 'approved' and proposal.community_after_event
      and membership.status in ('confirmed', 'attended')
  ) then
    raise exception 'A confirmed place at this event is required';
  end if;
  insert into public.event_follow_up_interests(event_id, user_id, interested, updated_at)
  values (p_event_id, auth.uid(), coalesce(p_interested, false), now())
  on conflict(event_id, user_id) do update
  set interested = excluded.interested, updated_at = now();
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'event.follow_up_interest_changed', 'event', p_event_id,
    jsonb_build_object('interested', coalesce(p_interested, false))
  );
end;
$$;

revoke all on function public.save_member_event_proposal(uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,text,boolean) from public;
grant execute on function public.save_member_event_proposal(uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text,text,text,integer,text,text,text,text,text,boolean,text,boolean) to authenticated;
revoke all on function public.cancel_member_event_proposal(uuid) from public;
grant execute on function public.cancel_member_event_proposal(uuid) to authenticated;
revoke all on function public.list_my_member_event_proposals() from public;
grant execute on function public.list_my_member_event_proposals() to authenticated;
revoke all on function public.list_admin_member_event_proposals() from public;
grant execute on function public.list_admin_member_event_proposals() to authenticated;
revoke all on function public.review_member_event_proposal(uuid,text,text) from public;
grant execute on function public.review_member_event_proposal(uuid,text,text) to authenticated;
revoke all on function public.get_my_event_follow_up_interest(uuid) from public;
grant execute on function public.get_my_event_follow_up_interest(uuid) to authenticated;
revoke all on function public.set_my_event_follow_up_interest(uuid,boolean) from public;
grant execute on function public.set_my_event_follow_up_interest(uuid,boolean) to authenticated;

comment on table public.member_event_proposals is
  'Active-member proposals for free public events. Admin approval creates the canonical event; publication and registration never happen directly from member input.';
comment on table public.event_follow_up_interests is
  'Per-attendee consent to hear about a possible post-event Community. It never creates Community membership automatically.';

commit;
