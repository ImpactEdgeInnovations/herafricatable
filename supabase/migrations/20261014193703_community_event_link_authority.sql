begin;

-- Applied live as version 20261014193703; existing links and content are preserved.
-- Internal policy helper: not executable through the client API.
create or replace function public.can_link_community_event(p_community_id uuid, p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.can_manage_community(p_community_id)
    and exists (
      select 1 from public.events event
      where event.id = p_event_id and event.status = 'published'
        and not exists (
          select 1 from public.community_event_links other_link
          where other_link.event_id = event.id and other_link.community_id <> p_community_id
        )
        and (
          (event.audience = 'community' and exists (
            select 1 from public.community_event_proposals proposal
            where proposal.canonical_event_id = event.id
              and proposal.community_id = p_community_id and proposal.status = 'approved'
          ))
          or (event.audience = 'public' and (
            public.is_admin(array['super_admin']::public.app_role[])
            or exists (
              select 1 from public.event_hosts host
              join public.profiles profile on profile.id = host.user_id
              where host.event_id = event.id and host.user_id = auth.uid()
                and host.status = 'active' and profile.access_status = 'active'
            )
          ))
        )
    );
$$;
revoke all on function public.can_link_community_event(uuid,uuid) from public, anon, authenticated;

create or replace function public.set_community_event_link(
  p_community_id uuid,
  p_event_id uuid,
  p_active boolean,
  p_featured boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  if p_active then
    -- Serialize linking with Host replacement/pausing and other linking choices.
    perform 1 from public.event_hosts where event_id = p_event_id for share;
    perform 1 from public.events where id = p_event_id for update;
    if not exists (
      select 1 from public.events
      where id = p_event_id and status = 'published'
    ) then
      raise exception 'Only a published event can be added';
    end if;

    if not public.can_link_community_event(p_community_id, p_event_id) then
      raise exception 'Choose an event you currently host, or a gathering created for this Community. An event already linked elsewhere cannot be added';
    end if;

    insert into public.community_event_links(
      community_id,
      event_id,
      is_featured,
      linked_by
    )
    values (
      p_community_id,
      p_event_id,
      coalesce(p_featured, false),
      auth.uid()
    )
    on conflict (community_id, event_id)
    do update set
      is_featured = excluded.is_featured,
      linked_by = auth.uid(),
      updated_at = now();
  else
    delete from public.community_event_links
    where community_id = p_community_id and event_id = p_event_id;
  end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    case when p_active
      then 'community.event_linked'
      else 'community.event_unlinked'
    end,
    'event',
    p_event_id,
    jsonb_build_object(
      'community_id', p_community_id,
      'featured', case when p_active then coalesce(p_featured, false) else false end
    )
  );
end;
$$;

create or replace function public.list_community_programming_options(
  p_community_id uuid
)
returns table(
  item_type text,
  item_id uuid,
  slug text,
  title text,
  summary text,
  starts_at timestamptz,
  format text,
  access_type text,
  is_linked boolean,
  is_featured boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  return query
  select programming.*
  from (
    select
      'event'::text as item_type,
      event.id as item_id,
      event.slug,
      event.title,
      event.summary,
      event.starts_at,
      event.format,
      null::text as access_type,
      link.event_id is not null as is_linked,
      coalesce(link.is_featured, false) as is_featured
    from public.events event
    left join public.community_event_links link
      on link.event_id = event.id
      and link.community_id = p_community_id
    where (event.status = 'published' and public.can_link_community_event(p_community_id, event.id))
      or (link.event_id is not null and event.status in ('published', 'completed'))

    union all

    select
      'resource'::text,
      course.id,
      course.slug,
      course.title,
      course.summary,
      null::timestamptz,
      null::text,
      course.access_type,
      link.course_id is not null,
      coalesce(link.is_featured, false)
    from public.courses course
    left join public.community_course_links link
      on link.course_id = course.id
      and link.community_id = p_community_id
    where course.status = 'published'
  ) programming
  order by programming.item_type, programming.starts_at nulls last, programming.title;
end;
$$;

revoke all on function public.set_community_event_link(uuid,uuid,boolean,boolean) from public, anon;
revoke all on function public.list_community_programming_options(uuid) from public, anon;
grant execute on function public.set_community_event_link(uuid,uuid,boolean,boolean) to authenticated;
grant execute on function public.list_community_programming_options(uuid) to authenticated;

commit;
