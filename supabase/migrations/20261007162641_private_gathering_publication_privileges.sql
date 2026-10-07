begin;
revoke all on function public.publish_community_gathering(uuid) from public, anon;
grant execute on function public.publish_community_gathering(uuid) to authenticated;
do $$
declare signature regprocedure;
begin
  select oid::regprocedure into strict signature from pg_proc
  where pronamespace='public'::regnamespace and proname='save_community_event_proposal';
  execute format('revoke all on function %s from public, anon', signature);
  execute format('grant execute on function %s to authenticated', signature);
end;
$$;
commit;
