begin;

-- A Community is independent of an event. Hosts may connect one they own to
-- several events. Draft links stay private until the Community has a public page.
create or replace function public.list_my_host_event_communities(p_event_id uuid)
returns table (
  community_id uuid,
  community_name text,
  community_slug text,
  community_status text,
  public_preview_enabled boolean,
  linked_to_event boolean,
  can_select boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.event_hosts host
    where host.event_id = p_event_id and host.user_id = auth.uid()
      and host.status = 'active'
  ) then
    raise exception 'Only this event Host can choose a Community';
  end if;

  return query
  select community.id, community.name::text, community.slug::text,
    community.status::text, community.public_preview_enabled,
    exists (
      select 1 from public.community_event_links link
      where link.event_id = p_event_id and link.community_id = community.id
    ),
    membership.user_id is not null
  from public.communities community
  left join public.community_memberships membership
    on membership.community_id = community.id
    and membership.user_id = auth.uid()
    and membership.role = 'owner'
    and membership.status = 'active'
  where (membership.user_id is not null or exists (
      select 1 from public.community_event_links link
      where link.event_id = p_event_id and link.community_id = community.id
    ))
    and community.status in ('draft', 'published')
  order by community.name;
end;
$$;
revoke all on function public.list_my_host_event_communities(uuid) from public;
grant execute on function public.list_my_host_event_communities(uuid) to authenticated;

create or replace function public.link_my_host_event_community(
  p_event_id uuid, p_community_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare existing_community_id uuid;
begin
  -- Lock the Host row so two simultaneous choices cannot connect two rooms.
  perform 1 from public.event_hosts host
  join public.events event on event.id = host.event_id
  where host.event_id = p_event_id and host.user_id = auth.uid()
    and host.status = 'active' and event.status in ('draft', 'published', 'completed')
  for update of host;
  if auth.uid() is null or not found then
    raise exception 'Only the active Host of this event can choose its Community';
  end if;
  if not exists (
    select 1 from public.communities community
    join public.community_memberships membership
      on membership.community_id = community.id
    where community.id = p_community_id
      and community.status in ('draft', 'published')
      and membership.user_id = auth.uid()
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'Choose a Community you own';
  end if;

  -- Do not silently replace an existing Community: gathering rooms, member
  -- reminders and event history may already refer to that relationship.
  select link.community_id into existing_community_id
  from public.community_event_links link
  where link.event_id = p_event_id
  order by link.created_at limit 1;
  if existing_community_id is not null and existing_community_id <> p_community_id then
    raise exception 'This event already has a Community. Ask the team to review a change';
  end if;

  insert into public.community_event_links(
    community_id, event_id, is_featured, linked_by
  ) values (p_community_id, p_event_id, true, auth.uid())
  on conflict (community_id, event_id) do nothing;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.community_linked_by_host', 'event', p_event_id,
    jsonb_build_object('community_id', p_community_id));
end;
$$;
revoke all on function public.link_my_host_event_community(uuid,uuid) from public;
grant execute on function public.link_my_host_event_community(uuid,uuid) to authenticated;

-- Guest pages cannot read community_event_links through its member-only RLS.
-- Return only an approved public Community, or an existing member's room.
create or replace function public.get_event_community_for_visitor(p_event_id uuid)
returns table (
  community_id uuid,
  name text,
  slug text,
  tagline text,
  community_type text
)
language sql stable security definer set search_path = '' as $$
  select community.id, community.name::text, community.slug::text,
    community.tagline::text, community.community_type::text
  from public.community_event_links link
  join public.events event on event.id = link.event_id
  join public.communities community on community.id = link.community_id
  where link.event_id = p_event_id
    and event.status in ('published', 'completed')
    and community.status = 'published'
    and (
      community.public_preview_enabled
      or exists (
        select 1 from public.community_memberships membership
        where membership.community_id = community.id
          and membership.user_id = auth.uid()
          and membership.status = 'active'
      )
    )
  order by link.is_featured desc, link.created_at
  limit 1;
$$;
revoke all on function public.get_event_community_for_visitor(uuid) from public;
grant execute on function public.get_event_community_for_visitor(uuid) to anon, authenticated;

commit;
