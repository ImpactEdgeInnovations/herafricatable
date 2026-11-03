-- TEST ONLY: fake tagged identities; no successful approval, notification send
-- or persistent change. Calls use NULL targets and all fixtures roll back.
begin;
create function pg_temp.approval_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end;$$;
create function pg_temp.approval_error(statement text,expected_state text,fragment text) returns boolean language plpgsql as $$begin execute statement;return false;exception when others then return sqlstate=expected_state and position(lower(fragment) in lower(sqlerrm))>0;end;$$;
create temp table approval_rpc_targets(signature text,call_sql text,admin_error text);
insert into approval_rpc_targets values
 ('public.review_member(uuid,text,text)', $q$select public.review_member(null,'approve','[TEST] Permission boundary')$q$, 'Member not found'),
 ('public.review_community_host_application(uuid,text,text,text)', $q$select public.review_community_host_application(null,'start_review',null,null)$q$, 'Community application not found'),
 ('public.review_member_event_proposal(uuid,text,text)', $q$select public.review_member_event_proposal(null,'start_review',null)$q$, 'Event proposal not found'),
 ('public.review_event_host_workspace(uuid,text,text)', $q$select public.review_event_host_workspace(null,'approve',null)$q$, 'A submitted Host draft is required');
grant select on approval_rpc_targets to anon,authenticated;
select pg_temp.approval_assert(not has_function_privilege('anon',signature,'execute'),signature||' anon denied') from approval_rpc_targets;
select pg_temp.approval_assert(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=signature::regprocedure and acl.grantee=0 and acl.privilege_type='EXECUTE'),signature||' no inherited PUBLIC execution') from approval_rpc_targets;
select pg_temp.approval_assert(has_function_privilege('authenticated',signature,'execute'),signature||' signed-in execution retained') from approval_rpc_targets;
select pg_temp.approval_assert(has_function_privilege('service_role',signature,'execute'),signature||' service execution unchanged') from approval_rpc_targets;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
select ('f1103000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'approval-permissions-'||n||'@test.invalid','authenticated','authenticated','{}','{}',now() from generate_series(1,2)n;
update public.profiles set access_status='active',is_test_account=true,display_name='[TEST] Approval permissions' where id::text like 'f1103000-%';
insert into public.user_roles(user_id,role,granted_by) values('f1103000-0000-4000-8000-000000000001','super_admin','f1103000-0000-4000-8000-000000000001');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.approval_assert(pg_temp.approval_error(call_sql,'42501','permission denied'),signature||' rejected before function body') from approval_rpc_targets;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1103000-0000-4000-8000-000000000002"}',true);
select set_config('request.jwt.claim.sub','f1103000-0000-4000-8000-000000000002',true);
select pg_temp.approval_assert(pg_temp.approval_error(call_sql,'P0001','Super admin'),signature||' ordinary member rejected by role guard') from approval_rpc_targets;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f1103000-0000-4000-8000-000000000001"}',true);
select set_config('request.jwt.claim.sub','f1103000-0000-4000-8000-000000000001',true);
select pg_temp.approval_assert(pg_temp.approval_error(call_sql,'P0001',admin_error),signature||' Super Admin reaches target validation') from approval_rpc_targets;
reset role;
rollback;
