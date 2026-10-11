begin;

-- Version aligned with the applied live migration history.

-- These are authenticated Community management APIs, not visitor endpoints.
-- Keep their existing authoritative Host/moderator checks and all member grants.
revoke execute on function public.set_community_event_link(uuid,uuid,boolean,boolean) from public, anon;
revoke execute on function public.list_community_programming_options(uuid) from public, anon;
grant execute on function public.set_community_event_link(uuid,uuid,boolean,boolean) to authenticated;
grant execute on function public.list_community_programming_options(uuid) to authenticated;

commit;
