begin;

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
    from public.community_memberships membership
    where membership.community_id = p_community_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
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

revoke all on function public.list_community_introductions(uuid) from public;
grant execute on function public.list_community_introductions(uuid) to authenticated;

comment on function public.list_community_introductions is
  'Blocked-pair-safe cohort introduction projection with explicitly qualified membership boundaries.';

commit;
