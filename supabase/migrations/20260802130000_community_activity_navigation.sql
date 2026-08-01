begin;

create or replace function public.list_my_community_activity()
returns table(
  community_id uuid,
  last_caught_up_at timestamptz,
  new_conversation_count bigint,
  new_reply_count bigint,
  new_activity_count bigint,
  latest_activity_at timestamptz
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
    or not public.is_active_member(actor) then
    raise exception 'Communities are unavailable';
  end if;

  return query
  select
    membership.community_id,
    summary.last_caught_up_at,
    summary.new_conversation_count,
    summary.new_reply_count,
    summary.new_activity_count,
    summary.latest_activity_at
  from public.community_memberships membership
  cross join lateral public.get_community_read_summary(
    membership.community_id
  ) summary
  where membership.user_id = actor
    and membership.status = 'active'
  order by
    summary.new_activity_count desc,
    summary.latest_activity_at desc nulls last,
    membership.joined_at desc nulls last;
end;
$$;

revoke all on function public.list_my_community_activity()
  from public;
grant execute on function public.list_my_community_activity()
  to authenticated;

comment on function public.list_my_community_activity is
  'Returns private, block-filtered new-activity counts only for the current active member''s communities. Hosts and moderators receive no member read-state visibility.';

commit;
