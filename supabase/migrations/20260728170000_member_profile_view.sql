begin;

create or replace function public.get_member_profile(p_member_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  industry text,
  country text,
  city text,
  bio text,
  business_name text,
  website_url text,
  languages text[],
  interests text[],
  goals text[],
  connection_id uuid,
  connection_status text,
  connection_direction text,
  phone text,
  whatsapp_number text,
  linkedin_url text,
  instagram_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.is_active_member(actor) then
    raise exception 'Active visible membership required';
  end if;

  if p_member_id is null
    or p_member_id = actor
    or not public.is_active_member(p_member_id)
    or public.is_blocked_pair(actor, p_member_id) then
    raise exception 'Member is unavailable';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.job_title,
    profile.company,
    profile.industry,
    profile.country,
    profile.city,
    profile.bio,
    profile.business_name,
    profile.website_url,
    profile.languages,
    coalesce(
      (
        select array_agg(interest.interest order by interest.interest)
        from public.profile_interests interest
        where interest.user_id = profile.id
      ),
      array[]::text[]
    ),
    coalesce(
      (
        select array_agg(goal.goal_key order by goal.goal_key)
        from public.member_goals goal
        where goal.user_id = profile.id
      ),
      array[]::text[]
    ),
    connection.id,
    connection.status,
    case
      when connection.requester_id = actor then 'outgoing'
      when connection.recipient_id = actor then 'incoming'
      else null
    end,
    case
      when connection.status = 'accepted'
        and private_profile.share_phone_with_connections
        then private_profile.phone
      else null
    end,
    case
      when connection.status = 'accepted'
        and private_profile.share_phone_with_connections
        then private_profile.whatsapp_number
      else null
    end,
    case
      when connection.status = 'accepted' then private_profile.linkedin_url
      else null
    end,
    case
      when connection.status = 'accepted' then private_profile.instagram_url
      else null
    end
  from public.profiles profile
  left join public.connections connection
    on connection.user_low = least(actor, profile.id)
   and connection.user_high = greatest(actor, profile.id)
   and connection.status in ('pending', 'accepted')
  left join public.profile_private private_profile
    on private_profile.user_id = profile.id
  where profile.id = p_member_id
    and profile.access_status = 'active'
    and not profile.visibility_paused;
end;
$$;

revoke all on function public.get_member_profile(uuid) from public;
grant execute on function public.get_member_profile(uuid) to authenticated;

comment on function public.get_member_profile is
  'Returns an active member public profile to another active, unblocked member. Private contact fields remain null until an accepted connection and phone-sharing consent permit them.';

commit;
