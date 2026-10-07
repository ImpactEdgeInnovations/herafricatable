-- Rollback-only rehearsal of the event page's existing joining APIs. Not a migration.
begin;
create temporary table event_join_results(result text);
do $$
declare cid uuid; member_id uuid; denied boolean;
begin
  select id into strict cid from public.communities where slug='lavington-women';
  select p.id into strict member_id from public.profiles p where public.is_active_member(p.id)
    and not exists(select 1 from public.community_memberships m where m.community_id=cid and m.user_id=p.id)
    and not exists(select 1 from public.user_roles r where r.user_id=p.id and r.role in ('super_admin','moderator','event_staff'))
    and not exists(select 1 from public.table_invitations t where t.invitee_user_id=p.id and t.status='membership_pending') limit 1;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',member_id,'role','authenticated')::text,true);
  update public.communities set join_policy='open' where id=cid;
  update public.profiles set access_status='pending' where id=member_id;
  denied:=false; begin perform public.request_community_access(cid); exception when others then denied:=true; end;
  if not denied then raise exception 'Pending platform account could join'; end if;
  update public.profiles set access_status='active' where id=member_id;
  perform public.request_community_access(cid);
  if not exists(select 1 from public.community_memberships where community_id=cid and user_id=member_id and status='active') then raise exception 'Active member could not join open Community'; end if;
  delete from public.community_memberships where community_id=cid and user_id=member_id;
  update public.communities set join_policy='approval' where id=cid;
  perform public.request_community_access(cid);
  if not exists(select 1 from public.community_memberships where community_id=cid and user_id=member_id and status='requested') then raise exception 'Approval policy bypassed'; end if;
  delete from public.community_memberships where community_id=cid and user_id=member_id;
  update public.communities set join_policy='invite_only' where id=cid;
  denied:=false; begin perform public.request_community_access(cid); exception when others then denied:=true; end;
  if not denied then raise exception 'Invitation-only bypassed'; end if;
  if has_function_privilege('anon','public.request_community_access(uuid)','execute') then raise exception 'Anonymous joining grant'; end if;
  insert into event_join_results values('PASS: pending-account denial, active member open joining, Host approval retained, invitation-only denial and anonymous RPC restriction');
end; $$;
select * from event_join_results;
rollback;
