begin;

create or replace function public.get_my_community_start_path(
  p_community_id uuid
)
returns table(
  joined_at timestamptz,
  has_introduction boolean,
  has_contribution boolean,
  has_accepted_connection boolean,
  has_upcoming_registration boolean,
  next_gathering_slug text,
  next_gathering_title text,
  next_gathering_starts_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = actor
        and membership.status = 'active'
    )
  then
    raise exception 'Active community membership required';
  end if;

  return query
  with membership_context as (
    select coalesce(membership.joined_at, membership.created_at) as joined_at
    from public.community_memberships membership
    where membership.community_id = p_community_id
      and membership.user_id = actor
      and membership.status = 'active'
  ),
  next_gathering as (
    select
      event.id,
      event.slug,
      event.title,
      event.starts_at
    from public.community_event_links link
    join public.events event on event.id = link.event_id
    where link.community_id = p_community_id
      and event.status = 'published'
      and event.ends_at >= now()
    order by link.is_featured desc, event.starts_at
    limit 1
  )
  select
    context.joined_at,
    exists (
      select 1
      from public.community_introductions introduction
      where introduction.community_id = p_community_id
        and introduction.user_id = actor
        and introduction.status = 'published'
    ),
    exists (
      select 1
      from public.community_posts post
      where post.community_id = p_community_id
        and post.author_id = actor
        and post.status = 'published'
    ),
    exists (
      select 1
      from public.connections connection
      join public.community_memberships other_membership
        on other_membership.community_id = p_community_id
       and other_membership.user_id = case
         when connection.user_low = actor then connection.user_high
         else connection.user_low
       end
       and other_membership.status = 'active'
      join public.profiles other_profile
        on other_profile.id = other_membership.user_id
       and other_profile.access_status = 'active'
      where actor in (connection.user_low, connection.user_high)
        and connection.status = 'accepted'
        and not public.is_blocked_pair(actor, other_membership.user_id)
    ),
    exists (
      select 1
      from public.event_memberships event_member
      join public.community_event_links link
        on link.event_id = event_member.event_id
       and link.community_id = p_community_id
      join public.events event on event.id = event_member.event_id
      where event_member.user_id = actor
        and event_member.status in ('confirmed', 'attended')
        and event.status = 'published'
        and event.ends_at >= now()
    ),
    gathering.slug,
    gathering.title,
    gathering.starts_at
  from membership_context context
  left join next_gathering gathering on true;
end;
$$;

revoke all on function public.get_my_community_start_path(uuid)
  from public;
grant execute on function public.get_my_community_start_path(uuid)
  to authenticated;

comment on function public.get_my_community_start_path(uuid)
  is 'Member-scoped room orientation using only the caller''s introduction, contribution, accepted relationship and gathering state; no public score or member comparison.';

commit;
