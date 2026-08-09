begin;

alter table public.events
  add column if not exists audience text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_audience_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_audience_check
      check (audience in ('public', 'community'));
  end if;
end;
$$;

create index if not exists events_audience_status_starts_idx
  on public.events(audience, status, starts_at);

create table if not exists public.community_event_proposals (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 4 and 140),
  summary text not null check (char_length(trim(summary)) between 40 and 2000),
  format text not null check (format in ('in_person', 'virtual', 'hybrid')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Africa/Nairobi' check (char_length(trim(timezone)) between 3 and 80),
  venue_name text,
  city text,
  country text not null default 'Kenya',
  address_line text,
  map_url text,
  online_url text,
  capacity integer not null check (capacity between 2 and 500),
  visibility text not null default 'community_only'
    check (visibility in ('community_only', 'public')),
  pricing_mode text not null default 'free'
    check (pricing_mode in ('free', 'manual_payment', 'automatic')),
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency text not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  safety_contact_name text not null check (char_length(trim(safety_contact_name)) between 2 and 120),
  safety_contact_phone text not null check (char_length(trim(safety_contact_phone)) between 7 and 40),
  accessibility_notes text check (accessibility_notes is null or char_length(accessibility_notes) <= 1200),
  host_note text check (host_note is null or char_length(host_note) <= 1200),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'declined', 'cancelled')),
  canonical_event_id uuid unique references public.events(id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 1200),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_event_proposal_time_order check (ends_at > starts_at),
  constraint community_event_proposal_location check (
    format = 'virtual'
    or (
      nullif(trim(coalesce(venue_name, '')), '') is not null
      and nullif(trim(coalesce(city, '')), '') is not null
    )
  ),
  constraint community_event_proposal_online check (
    format = 'in_person'
    or nullif(trim(coalesce(online_url, '')), '') is not null
  ),
  constraint community_event_proposal_price check (
    (pricing_mode = 'free' and price_minor = 0)
    or (pricing_mode <> 'free' and price_minor > 0)
  )
);

create index if not exists community_event_proposals_community_status_idx
  on public.community_event_proposals(community_id, status, starts_at);
create index if not exists community_event_proposals_review_idx
  on public.community_event_proposals(status, submitted_at, created_at);
create index if not exists community_event_proposals_proposer_idx
  on public.community_event_proposals(proposed_by, updated_at desc);

alter table public.community_event_proposals enable row level security;

drop policy if exists "Community hosts read event proposals"
  on public.community_event_proposals;
create policy "Community hosts read event proposals"
  on public.community_event_proposals for select
  to authenticated
  using (public.can_manage_community(community_id));

create or replace function public.can_view_event(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events event
    where event.id = p_event_id
      and event.status = 'published'
      and (
        event.audience = 'public'
        or public.can_manage_event(event.id)
        or (
          event.audience = 'community'
          and p_user_id is not null
          and p_user_id = auth.uid()
          and public.is_active_member(p_user_id)
          and exists (
            select 1
            from public.community_event_links event_link
            join public.community_memberships membership
              on membership.community_id = event_link.community_id
             and membership.user_id = p_user_id
             and membership.status = 'active'
            where event_link.event_id = event.id
          )
        )
      )
  );
$$;

create or replace function public.create_event_registration(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_quantity integer,
  p_attendee_note text,
  p_manual_reference text,
  p_manual_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  evt public.events%rowtype;
  ticket public.ticket_types%rowtype;
  saved_order uuid;
  requested integer;
  order_status text;
  registration_status text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into evt from public.events
  where id = p_event_id and status = 'published' for share;
  if not found or not public.can_view_event(p_event_id, actor) then
    raise exception 'Event is not available to this member';
  end if;
  if evt.registration_mode = 'closed' then raise exception 'Registration is closed'; end if;
  if evt.audience = 'community' and p_quantity <> 1 then
    raise exception 'Choose one Community place per member';
  end if;
  if exists(
    select 1 from public.registration_requests
    where event_id = p_event_id and user_id = actor
      and status not in ('rejected', 'cancelled')
  ) then raise exception 'You already have a registration for this event'; end if;
  if evt.registration_mode = 'waitlist' then
    insert into public.registration_requests(event_id, user_id, status, attendee_note)
    values(p_event_id, actor, 'waitlisted', nullif(trim(p_attendee_note), ''))
    returning id into saved_order;
    return saved_order;
  end if;
  select * into ticket from public.ticket_types
  where id = p_ticket_type_id and event_id = p_event_id and status = 'on_sale'
  for update;
  if not found then raise exception 'Ticket is not available'; end if;
  if p_quantity not between 1 and 10 then raise exception 'Choose between 1 and 10 tickets'; end if;
  if ticket.sales_start_at is not null and ticket.sales_start_at > now() then raise exception 'Ticket sales have not opened'; end if;
  if ticket.sales_end_at is not null and ticket.sales_end_at < now() then raise exception 'Ticket sales have ended'; end if;
  select coalesce(sum(order_items.quantity), 0) into requested
  from public.order_items
  join public.orders on orders.id = order_items.order_id
  where order_items.ticket_type_id = ticket.id
    and orders.status not in ('cancelled', 'expired', 'refunded');
  if ticket.inventory_quantity is not null and requested + p_quantity > ticket.inventory_quantity then
    raise exception 'Not enough tickets remain';
  end if;
  order_status := case when evt.registration_mode = 'automatic' then 'pending_payment' else 'pending_review' end;
  registration_status := order_status;
  insert into public.orders(user_id, event_id, status, processing_mode, currency, subtotal_minor, total_minor, reservation_expires_at)
  values(actor, p_event_id, order_status, evt.registration_mode, ticket.currency,
    ticket.price_minor * p_quantity, ticket.price_minor * p_quantity,
    case when evt.registration_mode = 'automatic' then now() + interval '20 minutes' else null end)
  returning id into saved_order;
  insert into public.order_items(order_id, ticket_type_id, quantity, unit_price_minor, line_total_minor)
  values(saved_order, ticket.id, p_quantity, ticket.price_minor, ticket.price_minor * p_quantity);
  insert into public.registration_requests(event_id, user_id, order_id, status, attendee_note)
  values(p_event_id, actor, saved_order, registration_status, nullif(trim(p_attendee_note), ''));
  if evt.registration_mode = 'manual_review' then
    insert into public.manual_payment_reviews(order_id, submitted_reference, submitter_note)
    values(saved_order, nullif(trim(p_manual_reference), ''), nullif(trim(p_manual_note), ''));
  end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(actor, 'registration.created', 'order', saved_order,
    jsonb_build_object('event_id', p_event_id, 'mode', evt.registration_mode,
      'total_minor', ticket.price_minor * p_quantity, 'currency', ticket.currency));
  return saved_order;
end;
$$;

revoke all on function public.can_view_event(uuid, uuid) from public;
grant execute on function public.can_view_event(uuid, uuid) to anon, authenticated;
revoke all on function public.create_event_registration(uuid,uuid,integer,text,text,text) from public;
grant execute on function public.create_event_registration(uuid,uuid,integer,text,text,text) to authenticated;

drop policy if exists "Anyone can read published events" on public.events;
create policy "Approved audiences read published events"
  on public.events for select to anon, authenticated
  using (public.can_view_event(id));

drop policy if exists "Anyone can read venues for published events" on public.venues;
create policy "Approved audiences read event venues"
  on public.venues for select to anon, authenticated
  using (exists (
    select 1 from public.events
    where events.venue_id = venues.id
      and public.can_view_event(events.id)
  ));

drop policy if exists "Anyone can read published programme days" on public.programme_days;
create policy "Approved audiences read programme days"
  on public.programme_days for select to anon, authenticated
  using (public.can_view_event(event_id));

drop policy if exists "Anyone can read speakers for published events" on public.event_speakers;
create policy "Approved audiences read event speakers"
  on public.event_speakers for select to anon, authenticated
  using (public.can_view_event(event_id));

drop policy if exists "Anyone can read published programme sessions" on public.programme_sessions;
create policy "Approved audiences read programme sessions"
  on public.programme_sessions for select to anon, authenticated
  using (status = 'published' and public.can_view_event(event_id));

drop policy if exists "Anyone can read speaker links for published sessions" on public.session_speakers;
create policy "Approved audiences read programme speaker links"
  on public.session_speakers for select to anon, authenticated
  using (exists (
    select 1 from public.programme_sessions session
    where session.id = session_speakers.session_id
      and session.status = 'published'
      and public.can_view_event(session.event_id)
  ));

drop policy if exists "Anyone can read published announcements" on public.event_announcements;
create policy "Approved audiences read event announcements"
  on public.event_announcements for select to anon, authenticated
  using (status = 'published' and public.can_view_event(event_id));

drop policy if exists "Anyone can read published sponsors" on public.event_sponsors;
create policy "Approved audiences read event sponsors"
  on public.event_sponsors for select to anon, authenticated
  using (is_published and public.can_view_event(event_id));

drop policy if exists "Anyone reads on-sale tickets" on public.ticket_types;
create policy "Approved audiences read on-sale tickets"
  on public.ticket_types for select to anon, authenticated
  using (status = 'on_sale' and public.can_view_event(event_id));

drop policy if exists "Anyone can read published event menus" on public.event_menus;
create policy "Approved audiences read event menus"
  on public.event_menus for select to anon, authenticated
  using (status = 'published' and public.can_view_event(event_id));

drop policy if exists "Anyone can read published menu courses" on public.menu_courses;
create policy "Approved audiences read menu courses"
  on public.menu_courses for select to anon, authenticated
  using (exists (
    select 1 from public.event_menus menu
    where menu.id = menu_courses.menu_id
      and menu.status = 'published'
      and public.can_view_event(menu.event_id)
  ));

drop policy if exists "Anyone can read published menu items" on public.menu_items;
create policy "Approved audiences read menu items"
  on public.menu_items for select to anon, authenticated
  using (status = 'published' and exists (
    select 1
    from public.menu_courses course
    join public.event_menus menu on menu.id = course.menu_id
    where course.id = menu_items.course_id
      and menu.status = 'published'
      and public.can_view_event(menu.event_id)
  ));

drop policy if exists "Anyone can read published gallery albums" on public.gallery_albums;
create policy "Approved audiences read gallery albums"
  on public.gallery_albums for select to anon, authenticated
  using (status = 'published' and public.can_view_event(event_id));

drop policy if exists "Anyone can read published media metadata" on public.media_assets;
create policy "Approved audiences read event media metadata"
  on public.media_assets for select to anon, authenticated
  using (status = 'published' and exists (
    select 1 from public.gallery_albums album
    where album.id = media_assets.album_id
      and album.status = 'published'
      and public.can_view_event(album.event_id)
  ));

drop policy if exists "Anyone reads published event recaps" on public.event_recaps;
create policy "Approved audiences read published event recaps"
  on public.event_recaps for select to anon, authenticated
  using (status = 'published' and public.can_view_event(event_id));

create or replace function public.can_read_event_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_event(public.event_media_event_id(object_name)) or exists (
    select 1
    from public.media_assets asset
    join public.gallery_albums album on album.id = asset.album_id
    where asset.storage_path = object_name
      and asset.status = 'published'
      and album.status = 'published'
      and public.can_view_event(album.event_id)
  );
$$;

create or replace function public.save_community_event_proposal(
  p_proposal_id uuid,
  p_community_id uuid,
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
  p_host_note text,
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
  target public.community_event_proposals%rowtype;
  next_status text := case when coalesce(p_submit, false) then 'submitted' else 'draft' end;
begin
  if actor is null or not public.can_manage_community(p_community_id, actor) then
    raise exception 'Community owner or Host access required';
  end if;
  if not public.is_active_member(actor)
    and not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Active membership required';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 4 and 140 then
    raise exception 'Enter a clear event name';
  end if;
  if char_length(trim(coalesce(p_summary, ''))) not between 40 and 2000 then
    raise exception 'Tell members what this gathering is for';
  end if;
  if p_format not in ('in_person', 'virtual', 'hybrid') then
    raise exception 'Choose an event format';
  end if;
  if p_ends_at <= p_starts_at then raise exception 'End time must follow start time'; end if;
  if p_ends_at > p_starts_at + interval '7 days' then
    raise exception 'A Community gathering cannot run longer than seven days';
  end if;
  if coalesce(p_submit, false) and p_starts_at < now() + interval '24 hours' then
    raise exception 'Submit gatherings at least 24 hours before they begin';
  end if;
  if p_capacity not between 2 and 500 then
    raise exception 'Capacity must be between 2 and 500 people';
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

  if p_proposal_id is null then
    if (
      select count(*)
      from public.community_event_proposals proposal
      where proposal.community_id = p_community_id
        and proposal.proposed_by = actor
        and proposal.status in ('draft', 'submitted', 'under_review', 'changes_requested')
    ) >= 10 then
      raise exception 'Resolve an existing event proposal before starting another';
    end if;

    insert into public.community_event_proposals (
      community_id, proposed_by, title, summary, format, starts_at, ends_at,
      timezone, venue_name, city, country, address_line, map_url, online_url,
      capacity, visibility, pricing_mode, price_minor, currency,
      safety_contact_name, safety_contact_phone, accessibility_notes,
      host_note, status, submitted_at
    ) values (
      p_community_id, actor, trim(p_title), trim(p_summary), p_format,
      p_starts_at, p_ends_at, coalesce(nullif(trim(p_timezone), ''), 'Africa/Nairobi'),
      nullif(trim(coalesce(p_venue_name, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      coalesce(nullif(trim(coalesce(p_country, '')), ''), 'Kenya'),
      nullif(trim(coalesce(p_address_line, '')), ''),
      nullif(trim(coalesce(p_map_url, '')), ''),
      nullif(trim(coalesce(p_online_url, '')), ''),
      p_capacity, 'community_only', 'free', 0, 'KES',
      trim(p_safety_contact_name), trim(p_safety_contact_phone),
      nullif(trim(coalesce(p_accessibility_notes, '')), ''),
      nullif(trim(coalesce(p_host_note, '')), ''),
      next_status, case when coalesce(p_submit, false) then now() else null end
    ) returning id into saved;
  else
    select * into target
    from public.community_event_proposals
    where id = p_proposal_id and community_id = p_community_id
    for update;
    if not found then raise exception 'Event proposal not found'; end if;
    if target.proposed_by <> actor
      and not exists (
        select 1 from public.community_memberships membership
        where membership.community_id = p_community_id
          and membership.user_id = actor
          and membership.status = 'active'
          and membership.role = 'owner'
      )
      and not public.is_admin(array['super_admin']::public.app_role[]) then
      raise exception 'Only the proposer or Community owner can edit this draft';
    end if;
    if target.status not in ('draft', 'changes_requested') then
      raise exception 'This proposal is already with the review team';
    end if;

    update public.community_event_proposals
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
        visibility = 'community_only',
        pricing_mode = 'free',
        price_minor = 0,
        currency = 'KES',
        safety_contact_name = trim(p_safety_contact_name),
        safety_contact_phone = trim(p_safety_contact_phone),
        accessibility_notes = nullif(trim(coalesce(p_accessibility_notes, '')), ''),
        host_note = nullif(trim(coalesce(p_host_note, '')), ''),
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
      then 'community.event_proposal_submitted'
      else 'community.event_proposal_saved'
    end,
    'community_event_proposal',
    saved,
    jsonb_build_object('community_id', p_community_id, 'format', p_format, 'free', true)
  );

  return saved;
end;
$$;

create or replace function public.cancel_community_event_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.community_event_proposals%rowtype;
begin
  select * into target
  from public.community_event_proposals
  where id = p_proposal_id
  for update;
  if not found or not public.can_manage_community(target.community_id) then
    raise exception 'Event proposal not found';
  end if;
  if target.status not in ('draft', 'submitted', 'changes_requested') then
    raise exception 'This event proposal can no longer be cancelled here';
  end if;
  update public.community_event_proposals
  set status = 'cancelled', updated_at = now()
  where id = p_proposal_id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'community.event_proposal_cancelled', 'community_event_proposal', p_proposal_id,
    jsonb_build_object('community_id', target.community_id));
end;
$$;

create or replace function public.list_my_community_event_proposals(p_community_id uuid)
returns table(
  proposal_id uuid,
  proposed_by uuid,
  proposer_name text,
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
  visibility text,
  pricing_mode text,
  safety_contact_name text,
  safety_contact_phone text,
  accessibility_notes text,
  host_note text,
  status text,
  canonical_event_id uuid,
  canonical_event_slug text,
  review_note text,
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
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community owner or Host access required';
  end if;
  return query
  select
    proposal.id,
    proposal.proposed_by,
    profile.display_name,
    proposal.title,
    proposal.summary,
    proposal.format,
    proposal.starts_at,
    proposal.ends_at,
    proposal.timezone,
    proposal.venue_name,
    proposal.city,
    proposal.country,
    proposal.address_line,
    proposal.map_url,
    proposal.online_url,
    proposal.capacity,
    proposal.visibility,
    proposal.pricing_mode,
    proposal.safety_contact_name,
    proposal.safety_contact_phone,
    proposal.accessibility_notes,
    proposal.host_note,
    proposal.status,
    proposal.canonical_event_id,
    event.slug,
    proposal.review_note,
    proposal.submitted_at,
    proposal.created_at,
    proposal.updated_at
  from public.community_event_proposals proposal
  left join public.profiles profile on profile.id = proposal.proposed_by
  left join public.events event on event.id = proposal.canonical_event_id
  where proposal.community_id = p_community_id
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
end;
$$;

create or replace function public.list_admin_community_event_proposals()
returns table(
  proposal_id uuid,
  community_id uuid,
  community_name text,
  community_slug text,
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
  visibility text,
  pricing_mode text,
  safety_contact_name text,
  safety_contact_phone text,
  accessibility_notes text,
  host_note text,
  status text,
  canonical_event_id uuid,
  canonical_event_slug text,
  review_note text,
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
    proposal.id,
    proposal.community_id,
    community.name,
    community.slug,
    proposal.proposed_by,
    profile.display_name,
    user_account.email::text,
    proposal.title,
    proposal.summary,
    proposal.format,
    proposal.starts_at,
    proposal.ends_at,
    proposal.timezone,
    proposal.venue_name,
    proposal.city,
    proposal.country,
    proposal.address_line,
    proposal.map_url,
    proposal.online_url,
    proposal.capacity,
    proposal.visibility,
    proposal.pricing_mode,
    proposal.safety_contact_name,
    proposal.safety_contact_phone,
    proposal.accessibility_notes,
    proposal.host_note,
    proposal.status,
    proposal.canonical_event_id,
    event.slug,
    proposal.review_note,
    proposal.submitted_at,
    proposal.created_at,
    proposal.updated_at
  from public.community_event_proposals proposal
  join public.communities community on community.id = proposal.community_id
  join auth.users user_account on user_account.id = proposal.proposed_by
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

create or replace function public.review_community_event_proposal(
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
  target public.community_event_proposals%rowtype;
  saved_venue uuid;
  saved_event uuid;
  saved_slug text;
  next_status text;
  member_id uuid;
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

  select * into target
  from public.community_event_proposals
  where id = p_proposal_id
  for update;
  if not found then raise exception 'Event proposal not found'; end if;

  if p_action = 'approve' and target.status = 'approved'
    and target.canonical_event_id is not null then
    return target.canonical_event_id;
  end if;
  if target.status not in ('submitted', 'under_review') then
    raise exception 'Only a submitted event proposal can be reviewed';
  end if;

  if p_action = 'approve' then
    if target.visibility <> 'community_only'
      or target.pricing_mode <> 'free'
      or target.price_minor <> 0 then
      raise exception 'Public and paid Community events are not open yet';
    end if;
    if target.starts_at < now() + interval '12 hours' then
      raise exception 'The event is too close to approve safely';
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
    saved_slug := trim(both '-' from saved_slug) || '-' || to_char(target.starts_at at time zone target.timezone, 'YYYY-MM-DD') || '-' || left(target.id::text, 8);

    insert into public.events(
      slug, title, summary, format, status, starts_at, ends_at, timezone,
      venue_id, capacity, registration_mode, is_featured, audience,
      created_by, updated_by
    ) values (
      saved_slug, trim(target.title), trim(target.summary), target.format,
      'published', target.starts_at, target.ends_at, target.timezone,
      saved_venue, target.capacity, 'manual_review', false, 'community',
      target.proposed_by, actor
    ) returning id into saved_event;

    insert into public.event_private_details(event_id, online_url, check_in_instructions)
    values (
      saved_event,
      nullif(trim(coalesce(target.online_url, '')), ''),
      'Follow the Community Host and event team instructions. Escalate any safety concern through Her Africa Table support.'
    );

    insert into public.community_event_links(community_id, event_id, is_featured, linked_by)
    values (target.community_id, saved_event, false, actor);

    insert into public.ticket_types(
      event_id, name, description, price_minor, currency, inventory_quantity,
      sales_start_at, sales_end_at, status, sort_order
    ) values (
      saved_event,
      'Community place',
      'A complimentary place for an active member of this Community.',
      0,
      'KES',
      target.capacity,
      now(),
      target.starts_at,
      'on_sale',
      0
    );

    update public.community_event_proposals
    set status = 'approved',
        canonical_event_id = saved_event,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_by = actor,
        reviewed_at = now(),
        updated_at = now()
    where id = target.id;

    perform public.enqueue_notification(
      target.proposed_by,
      'event',
      'Your Community gathering is approved',
      target.title || ' is ready for members. You can now share it inside your Community.',
      '/events/' || saved_slug,
      'community-event-approved:' || target.id
    );

    for member_id in
      select membership.user_id
      from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.status = 'active'
        and membership.user_id <> target.proposed_by
    loop
      perform public.enqueue_notification(
        member_id,
        'event',
        'A new Community gathering',
        target.title || ' is now open inside your Community.',
        '/events/' || saved_slug,
        'community-event-open:' || target.id || ':' || member_id
      );
    end loop;

    next_status := 'approved';
  else
    next_status := case p_action
      when 'start_review' then 'under_review'
      when 'request_changes' then 'changes_requested'
      else 'declined'
    end;
    update public.community_event_proposals
    set status = next_status,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_by = actor,
        reviewed_at = now(),
        updated_at = now()
    where id = target.id;

    if p_action in ('request_changes', 'decline') then
      perform public.enqueue_notification(
        target.proposed_by,
        'event',
        case when p_action = 'request_changes'
          then 'Your gathering needs a small update'
          else 'An update on your gathering proposal'
        end,
        case when p_action = 'request_changes'
          then 'The review team left guidance in your Host workspace. Update the proposal and send it again.'
          else 'The review team could not approve this gathering. Open your Host workspace for the decision note.'
        end,
        '/communities/' || (select slug from public.communities where id = target.community_id) || '/host#gathering-proposals',
        'community-event-review:' || target.id || ':' || next_status
      );
    end if;
    saved_event := null;
  end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor,
    'community.event_proposal_' || p_action,
    'community_event_proposal',
    target.id,
    jsonb_build_object(
      'community_id', target.community_id,
      'status', next_status,
      'canonical_event_id', saved_event,
      'audience', target.visibility,
      'pricing_mode', target.pricing_mode,
      'review_note', nullif(trim(coalesce(p_review_note, '')), '')
    )
  );

  return saved_event;
end;
$$;

create or replace function public.search_my_table(
  p_query text,
  p_limit integer default 30
)
returns table (
  result_type text,
  result_id uuid,
  title text,
  subtitle text,
  excerpt text,
  href text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_query text := lower(trim(coalesce(p_query, '')));
  pattern text;
begin
  if not public.is_active_member(actor) then raise exception 'Active membership required'; end if;
  if char_length(clean_query) not between 2 and 80 then raise exception 'Search must be between 2 and 80 characters'; end if;
  pattern := '%' || clean_query || '%';

  return query
  with search_results as (
    select 'member'::text result_type, profile.id result_id, profile.display_name title,
      concat_ws(' · ', nullif(profile.job_title, ''), nullif(profile.company, '')) subtitle,
      concat_ws(' · ', nullif(profile.industry, ''), nullif(profile.country, '')) excerpt,
      '/members/' || profile.id::text href, profile.updated_at occurred_at,
      case when lower(profile.display_name) = clean_query then 100 when lower(profile.display_name) like clean_query || '%' then 90 else 65 end relevance
    from public.profiles profile
    where profile.access_status = 'active' and not profile.visibility_paused and profile.id <> actor
      and not public.is_blocked_pair(actor, profile.id)
      and lower(concat_ws(' ', profile.display_name, profile.job_title, profile.company, profile.industry, profile.country)) like pattern
    union all
    select 'community', community.id, community.name, 'Community', left(community.description, 180),
      '/communities/' || community.slug, community.updated_at,
      case when lower(community.name) = clean_query then 98 when lower(community.name) like clean_query || '%' then 88 else 60 end
    from public.communities community
    join public.community_memberships membership on membership.community_id = community.id and membership.user_id = actor and membership.status = 'active'
    where public.communities_enabled() and community.status = 'published'
      and lower(concat_ws(' ', community.name, community.description)) like pattern
    union all
    select 'conversation', post.id, creator.display_name,
      community.name || ' · ' || replace(post.category, '_', ' '), left(post.body, 220),
      '/communities/' || community.slug || '#conversation-' || post.id::text, post.created_at,
      case when lower(post.body) like clean_query || '%' then 76 else 58 end
    from public.community_posts post
    join public.communities community on community.id = post.community_id
    join public.community_memberships membership on membership.community_id = post.community_id and membership.user_id = actor and membership.status = 'active'
    join public.profiles creator on creator.id = post.author_id
    where public.communities_enabled() and post.parent_post_id is null and post.status = 'published'
      and community.status = 'published' and creator.access_status = 'active'
      and not public.is_blocked_pair(actor, post.author_id)
      and lower(concat_ws(' ', post.body, creator.display_name, post.category, community.name)) like pattern
    union all
    select 'event', event.id, event.title,
      concat_ws(' · ', replace(event.format, '_', ' '), venue.city),
      left(coalesce(event.summary, 'View event details and registration.'), 180),
      '/events/' || event.slug, event.starts_at,
      case when lower(event.title) = clean_query then 96 when lower(event.title) like clean_query || '%' then 86 else 55 end
    from public.events event
    left join public.venues venue on venue.id = event.venue_id
    where public.can_view_event(event.id, actor)
      and event.ends_at >= now() - interval '1 year'
      and lower(concat_ws(' ', event.title, event.summary, event.format, venue.name, venue.city, venue.country)) like pattern
    union all
    select 'learning', course.id, course.title, 'Learning · ' || course.instructor_name,
      left(course.summary, 180), '/learning/' || course.slug, course.created_at,
      case when lower(course.title) = clean_query then 94 when lower(course.title) like clean_query || '%' then 84 else 54 end
    from public.courses course
    where public.learning_enabled() and course.status = 'published'
      and lower(concat_ws(' ', course.title, course.summary, course.instructor_name)) like pattern
  )
  select search_results.result_type, search_results.result_id, search_results.title,
    nullif(search_results.subtitle, ''), nullif(search_results.excerpt, ''),
    search_results.href, search_results.occurred_at
  from search_results
  order by search_results.relevance desc, search_results.occurred_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 40);
end;
$$;

create or replace function public.list_public_past_events(p_limit integer default 24,p_offset integer default 0)
returns table(event_id uuid,slug text,title text,summary text,format text,starts_at timestamptz,ends_at timestamptz,timezone text,venue_name text,city text,country text,recap_title text,recap_summary text,highlights text[])
language sql stable security definer set search_path=''as $$
 select e.id,e.slug,e.title,e.summary,e.format,e.starts_at,e.ends_at,e.timezone,v.name,v.city,v.country,r.title,r.summary,r.highlights
 from public.events e left join public.venues v on v.id=e.venue_id left join public.event_recaps r on r.event_id=e.id and r.status='published'
 where e.audience='public' and e.status in('published','completed')and e.ends_at<now() order by e.starts_at desc limit least(greatest(coalesce(p_limit,24),1),50)offset greatest(coalesce(p_offset,0),0)
$$;

create or replace function public.get_public_community_about(p_slug text)
returns table(
  community_id uuid,slug text,name text,tagline text,about_summary text,
  audience_summary text,about_benefits text[],accent_key text,icon_asset_id uuid,
  icon_alt_text text,icon_width integer,icon_height integer,cover_asset_id uuid,
  cover_alt_text text,cover_width integer,cover_height integer,host_display_name text,
  host_intro text,community_type text,member_count bigint,membership_status text,
  offer_access_type text,offer_price_minor bigint,offer_currency text,
  offer_billing_interval text,offer_payment_mode text,commerce_enabled boolean,
  next_event_slug text,next_event_title text,next_event_summary text,
  next_event_format text,next_event_starts_at timestamptz,next_event_city text,
  next_event_country text
)
language plpgsql stable security definer set search_path=''as $$
begin
  if not public.communities_enabled() then return; end if;
  return query
  select community.id,community.slug,community.name,community.tagline,
    community.about_summary,community.audience_summary,community.about_benefits,
    community.accent_key,icon.id,icon.alt_text,icon.width,icon.height,cover.id,
    cover.alt_text,cover.width,cover.height,community.host_display_name,
    community.host_intro,community.community_type,
    case when community.show_public_member_count then (
      select count(*) from public.community_memberships active_membership
      where active_membership.community_id=community.id and active_membership.status='active'
    ) else null::bigint end,
    (select membership.status from public.community_memberships membership
      where membership.community_id=community.id and membership.user_id=auth.uid()),
    offer.access_type,offer.price_minor,offer.currency,offer.billing_interval,
    offer.payment_mode,public.community_creator_commerce_enabled(),next_event.slug,
    next_event.title,next_event.summary,next_event.format,next_event.starts_at,
    next_event.city,next_event.country
  from public.communities community
  left join public.community_media_assets icon on icon.id=community.icon_asset_id and icon.status='active'
  left join public.community_media_assets cover on cover.id=community.cover_asset_id and cover.status='active'
  left join public.community_offers offer on offer.community_id=community.id and offer.status='published'
  left join lateral (
    select event.slug,event.title,event.summary,event.format,event.starts_at,venue.city,venue.country
    from public.community_event_links event_link
    join public.events event on event.id=event_link.event_id
    left join public.venues venue on venue.id=event.venue_id
    where event_link.community_id=community.id and event.status='published'
      and event.audience='public' and event.ends_at>=now()
    order by event_link.is_featured desc,event.starts_at limit 1
  ) next_event on true
  where community.slug=lower(trim(p_slug)) and community.status='published'
    and community.public_preview_enabled and public.community_release_ready(community.id)
  limit 1;
end;
$$;

revoke all on function public.save_community_event_proposal(uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text,text,text,integer,text,text,text,text,boolean) from public;
grant execute on function public.save_community_event_proposal(uuid,uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text,text,text,integer,text,text,text,text,boolean) to authenticated;
revoke all on function public.cancel_community_event_proposal(uuid) from public;
grant execute on function public.cancel_community_event_proposal(uuid) to authenticated;
revoke all on function public.list_my_community_event_proposals(uuid) from public;
grant execute on function public.list_my_community_event_proposals(uuid) to authenticated;
revoke all on function public.list_admin_community_event_proposals() from public;
grant execute on function public.list_admin_community_event_proposals() to authenticated;
revoke all on function public.review_community_event_proposal(uuid,text,text) from public;
grant execute on function public.review_community_event_proposal(uuid,text,text) to authenticated;
revoke all on function public.search_my_table(text,integer) from public;
grant execute on function public.search_my_table(text,integer) to authenticated;
revoke all on function public.list_public_past_events(integer,integer) from public;
grant execute on function public.list_public_past_events(integer,integer) to anon,authenticated;
revoke all on function public.get_public_community_about(text) from public;
grant execute on function public.get_public_community_about(text) to anon,authenticated;

comment on table public.community_event_proposals is
  'Private Host event proposals. Approval creates one canonical, Community-scoped event.';
comment on function public.can_view_event(uuid,uuid) is
  'Audience boundary for public and Community-scoped canonical events.';
comment on function public.review_community_event_proposal(uuid,text,text) is
  'Fail-closed Super Admin review; only free Community-only proposals can create events.';

commit;
