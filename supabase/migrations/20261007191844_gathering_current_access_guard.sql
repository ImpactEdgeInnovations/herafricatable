begin;
create or replace function public.can_access_community_gathering(p_room_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.community_gathering_rooms room
    join public.events event on event.id=room.event_id
    join public.communities community on community.id=room.community_id
    where room.id=p_room_id and event.status in ('published','completed')
      and community.status='published' and public.communities_enabled()
      and public.is_active_member(p_user_id)
      and (public.can_manage_community(room.community_id,p_user_id)
        or exists(select 1 from public.community_memberships membership
          where membership.community_id=room.community_id and membership.user_id=p_user_id and membership.status='active'))
  );
$$;
revoke all on function public.can_access_community_gathering(uuid,uuid) from public,anon;
grant execute on function public.can_access_community_gathering(uuid,uuid) to authenticated;
commit;
