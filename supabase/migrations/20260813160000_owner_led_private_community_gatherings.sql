begin;

create or replace function public.publish_community_gathering(
  p_proposal_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_event_proposals%rowtype;
  community public.communities%rowtype;
  saved_venue uuid;
  saved_event uuid;
  saved_slug text;
  member_id uuid;
begin
  select * into target
  from public.community_event_proposals
  where id = p_proposal_id
  for update;
  if not found then raise exception 'Gathering draft not found'; end if;

  if not public.can_manage_community(target.community_id, actor) then
    raise exception 'Community owner or moderator required';
  end if;
  if not public.is_active_member(actor)
    and not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Active membership required';
  end if;
  if target.status = 'approved' and target.canonical_event_id is not null then
    return target.canonical_event_id;
  end if;
  if target.status not in ('draft', 'changes_requested') then
    raise exception 'This gathering can no longer be opened here';
  end if;
  if target.visibility <> 'community_only'
    or target.pricing_mode <> 'free'
    or target.price_minor <> 0 then
    raise exception 'Public or paid events require Her Africa Table review';
  end if;
  if target.starts_at < now() + interval '24 hours' then
    raise exception 'Open the gathering at least 24 hours before it begins';
  end if;

  select * into community
  from public.communities
  where id = target.community_id
  for update;
  if not found or community.status <> 'published' then
    raise exception 'The Community must be open before a gathering can be published';
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
    to_char(target.starts_at at time zone target.timezone, 'YYYY-MM-DD') || '-' ||
    left(target.id::text, 8);

  insert into public.events(
    slug, title, summary, format, status, starts_at, ends_at, timezone,
    venue_id, capacity, registration_mode, is_featured, audience,
    created_by, updated_by
  ) values (
    saved_slug, trim(target.title), trim(target.summary), target.format,
    'published', target.starts_at, target.ends_at, target.timezone,
    saved_venue, target.capacity, 'closed', false, 'community',
    target.proposed_by, actor
  ) returning id into saved_event;

  insert into public.event_private_details(
    event_id, online_url, check_in_instructions
  ) values (
    saved_event,
    nullif(trim(coalesce(target.online_url, '')), ''),
    'Follow the Community owner''s gathering guidance. Report any safety concern privately through Her Africa Table support.'
  );

  insert into public.community_event_links(
    community_id, event_id, is_featured, linked_by
  ) values (target.community_id, saved_event, false, actor);

  update public.community_event_proposals
  set status = 'approved',
      canonical_event_id = saved_event,
      review_note = null,
      reviewed_by = null,
      reviewed_at = now(),
      submitted_at = coalesce(submitted_at, now()),
      updated_at = now()
  where id = target.id;

  for member_id in
    select membership.user_id
    from public.community_memberships membership
    where membership.community_id = target.community_id
      and membership.status = 'active'
      and membership.user_id <> actor
  loop
    perform public.enqueue_notification(
      member_id,
      'event',
      'A new gathering in ' || community.name,
      target.title || ' is now open to members of your Community.',
      '/events/' || saved_slug,
      'community-gathering-open:' || target.id || ':' || member_id
    );
  end loop;

  insert into public.audit_events(
    actor_id, action, target_type, target_id, metadata
  ) values (
    actor,
    'community.gathering_published_by_host',
    'community_event_proposal',
    target.id,
    jsonb_build_object(
      'community_id', target.community_id,
      'canonical_event_id', saved_event,
      'audience', 'community_only',
      'pricing_mode', 'free'
    )
  );

  return saved_event;
end;
$$;

revoke all on function public.publish_community_gathering(uuid) from public;
grant execute on function public.publish_community_gathering(uuid) to authenticated;

comment on function public.publish_community_gathering is
  'Lets an approved Community owner or moderator publish a free member-only gathering without repeated Admin approval; public and paid events remain gated.';

commit;
