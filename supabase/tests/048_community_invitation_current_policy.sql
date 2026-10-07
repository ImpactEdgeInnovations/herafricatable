-- Rollback-only acceptance, NOT a migration. No invitations are delivered.
begin;
create temporary table invitation_policy_results(result text);
do $$
declare cid uuid; owner_id uuid; member_id uuid; email_value text; iid uuid; mode text; expected text;
begin
  select c.id,m.user_id into strict cid,owner_id from public.communities c join public.community_memberships m on m.community_id=c.id and m.role='owner' and m.status='active' where c.slug='lavington-women';
  select p.id,lower(u.email) into strict member_id,email_value from public.profiles p join auth.users u on u.id=p.id
    where p.id<>owner_id and public.is_active_member(p.id) and not exists(select 1 from public.user_roles r where r.user_id=p.id and r.role in ('super_admin','moderator','event_staff'))
    and not exists(select 1 from public.table_invitations t where t.community_id=cid and t.invitee_email=lower(u.email) and t.status in ('pending_review','sent','opened','membership_pending','claimed')) limit 1;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  foreach mode in array array['open','approval','invite_only'] loop
    delete from public.community_memberships where community_id=cid and user_id=member_id;
    update public.communities set join_policy=mode,community_type='private',admission_mode='approval' where id=cid;
    update public.profiles set access_status='pending' where id=member_id;
    insert into public.table_invitations(inviter_id,invitee_email,invitee_user_id,destination_type,community_id,status,token_hash,sent_at,expires_at)
      values(owner_id,email_value,member_id,'community',cid,'membership_pending',encode(gen_random_bytes(32),'hex'),now()-interval '1 hour',now()+interval '1 day') returning id into iid;
    update public.profiles set access_status='active' where id=member_id;
    expected:=case when mode='approval' then 'requested' else 'active' end;
    if not exists(select 1 from public.community_memberships where community_id=cid and user_id=member_id and status=expected and role='member') then raise exception 'Wrong current-policy result for %',mode; end if;
    if not exists(select 1 from public.table_invitations where id=iid and status='joined') then raise exception 'Invitation did not resume'; end if;
  end loop;
  -- Existing roles and active memberships must not be downgraded.
  update public.community_memberships set role='moderator',status='active' where community_id=cid and user_id=member_id;
  update public.communities set join_policy='approval' where id=cid;
  update public.profiles set access_status='pending' where id=member_id;
  insert into public.table_invitations(inviter_id,invitee_email,invitee_user_id,destination_type,community_id,status,token_hash,sent_at,expires_at)
    values(owner_id,email_value,member_id,'community',cid,'membership_pending',encode(gen_random_bytes(32),'hex'),now()-interval '1 hour',now()+interval '1 day') returning id into iid;
  update public.profiles set access_status='active' where id=member_id;
  if not exists(select 1 from public.community_memberships where community_id=cid and user_id=member_id and role='moderator' and status='active') then raise exception 'Existing role/status changed'; end if;
  -- A removal after the invitation was sent wins.
  update public.community_memberships set status='removed',updated_at=now() where community_id=cid and user_id=member_id;
  update public.profiles set access_status='pending' where id=member_id;
  insert into public.table_invitations(inviter_id,invitee_email,invitee_user_id,destination_type,community_id,status,token_hash,sent_at,expires_at)
    values(owner_id,email_value,member_id,'community',cid,'membership_pending',encode(gen_random_bytes(32),'hex'),now()-interval '1 hour',now()+interval '1 day') returning id into iid;
  update public.profiles set access_status='active' where id=member_id;
  if not exists(select 1 from public.community_memberships where community_id=cid and user_id=member_id and status='removed') then raise exception 'Old invitation undid removal'; end if;
  update public.table_invitations set status='revoked',token_hash=null where id=iid;
  -- Invitation-only requires a current Host's invitation, not a member's.
  delete from public.community_memberships where community_id=cid and user_id=member_id;
  update public.communities set join_policy='invite_only' where id=cid;
  update public.profiles set access_status='pending' where id=member_id;
  insert into public.table_invitations(inviter_id,invitee_email,invitee_user_id,destination_type,community_id,status,token_hash,sent_at,expires_at)
    values(member_id,email_value,member_id,'community',cid,'membership_pending',encode(gen_random_bytes(32),'hex'),now()-interval '1 hour',now()+interval '1 day') returning id into iid;
  update public.profiles set access_status='active' where id=member_id;
  if exists(select 1 from public.community_memberships where community_id=cid and user_id=member_id) then raise exception 'Non-Host invitation bypassed invitation-only'; end if;
  if has_function_privilege('anon','public.resume_table_invitations_after_activation()','execute') or has_function_privilege('authenticated','public.resume_table_invitations_after_activation()','execute') then raise exception 'Internal trigger exposed'; end if;
  insert into invitation_policy_results values('PASS: current open/approval/invite-only policy, Host-only private invitation, preserved moderator role, removal precedence and internal trigger privileges');
end; $$;
select * from invitation_policy_results;
rollback;
