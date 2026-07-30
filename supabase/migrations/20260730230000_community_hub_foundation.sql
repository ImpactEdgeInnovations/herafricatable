begin;

create or replace function public.list_community_member_directory(
  p_community_id uuid,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(
  user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  city text,
  country text,
  membership_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.communities_enabled()
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    ) then
    raise exception 'Active community membership required';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.job_title,
    profile.company,
    profile.city,
    profile.country,
    membership.role
  from public.community_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.community_id = p_community_id
    and membership.status = 'active'
    and profile.access_status = 'active'
    and not profile.visibility_paused
    and not public.is_blocked_pair(auth.uid(), profile.id)
  order by
    case membership.role
      when 'owner' then 0
      when 'moderator' then 1
      else 2
    end,
    profile.display_name
  limit least(greatest(coalesce(p_limit, 24), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_community_member_directory(uuid, integer, integer)
  from public;
grant execute on function public.list_community_member_directory(uuid, integer, integer)
  to authenticated;

comment on function public.list_community_member_directory(uuid, integer, integer)
  is 'Privacy-safe member roster available only to active members of the same enabled community.';

commit;
