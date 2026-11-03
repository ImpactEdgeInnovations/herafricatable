begin;
-- Applied through the connected migration service on 3 November 2026.

-- Approval screens call these RPCs with the signed-in user's session.
-- Remove both PostgreSQL's inherited PUBLIC grant and Supabase's explicit
-- anonymous grant. Preserve authenticated/service access and every existing
-- in-function Super Admin check, audit entry and notification operation.
revoke execute on function public.review_member(uuid,text,text) from public,anon;
revoke execute on function public.review_community_host_application(uuid,text,text,text) from public,anon;
revoke execute on function public.review_member_event_proposal(uuid,text,text) from public,anon;
revoke execute on function public.review_event_host_workspace(uuid,text,text) from public,anon;

grant execute on function public.review_member(uuid,text,text) to authenticated;
grant execute on function public.review_community_host_application(uuid,text,text,text) to authenticated;
grant execute on function public.review_member_event_proposal(uuid,text,text) to authenticated;
grant execute on function public.review_event_host_workspace(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
