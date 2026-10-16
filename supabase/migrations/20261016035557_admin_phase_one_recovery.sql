begin;
create or replace function public.review_refund_request(p_refund_id uuid,p_action text,p_reviewer_note text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.orders%rowtype; request_row public.refund_requests%rowtype;
begin
  select * into request_row from public.refund_requests where id=p_refund_id and status='requested' for update;
  if not found then raise exception 'Pending refund request not found'; end if;
  select * into target from public.orders where id=request_row.order_id for update;
  if actor is null or not public.can_manage_event(target.event_id) then raise exception 'Not authorized'; end if;
  if p_action is null or p_action not in ('approve','reject') then raise exception 'Unsupported refund action'; end if;
  if p_action='reject' and nullif(trim(p_reviewer_note),'') is null then raise exception 'A rejection reason is required'; end if;
  if p_action='reject' then
    update public.refund_requests set status='rejected',reviewer_id=actor,reviewer_note=trim(p_reviewer_note),reviewed_at=now(),updated_at=now() where id=p_refund_id;
  else
    update public.refund_requests set status='approved',reviewer_id=actor,reviewer_note=nullif(trim(p_reviewer_note),''),reviewed_at=now(),updated_at=now() where id=p_refund_id;
    update public.orders set status='refund_pending',updated_at=now() where id=target.id;
  end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'refund.'||p_action,'order',target.id,jsonb_build_object('refund_request_id',p_refund_id,'mode',target.processing_mode));
end; $$;
create function public.get_my_active_admin_role() returns public.app_role language sql stable security invoker set search_path='' as $$
 select role from public.user_roles where user_id=auth.uid() and (expires_at is null or expires_at>now())
 order by case role when 'super_admin' then 0 when 'event_staff' then 1 else 2 end limit 1;
$$;
revoke all on function public.get_my_active_admin_role() from public,anon;
grant execute on function public.get_my_active_admin_role() to authenticated;

alter table public.privacy_requests drop constraint privacy_requests_status_check;
alter table public.privacy_requests add constraint privacy_requests_status_check check(status in ('submitted','in_review','approved','processing','rejected','completed','cancelled'));
alter table public.privacy_requests add column anonymized_at timestamptz,add column avatar_removed_at timestamptz,add column auth_disabled_at timestamptz,add column cleanup_error text;

create function public.record_account_cleanup_step(p_request_id uuid,p_step text,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
declare target public.privacy_requests%rowtype;
begin
 if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super Admin required';end if;
 select * into target from public.privacy_requests where id=p_request_id and request_type='deletion' and status in ('processing','completed') for update;
 if not found then raise exception 'Account cleanup has not started';end if;
 if target.status='completed' then return;end if;
 if p_step is null or p_step not in ('avatar','auth') or p_success is null then raise exception 'Choose a cleanup step';end if;
 update public.privacy_requests set avatar_removed_at=case when p_step='avatar' and p_success then coalesce(avatar_removed_at,now()) else avatar_removed_at end,
 auth_disabled_at=case when p_step='auth' and p_success then coalesce(auth_disabled_at,now()) else auth_disabled_at end,
 cleanup_error=case when p_success then null else 'The '||p_step||' cleanup needs another try.' end,updated_at=now() where id=p_request_id;
 update public.privacy_requests set status='completed',completed_at=now(),cleanup_error=null where id=p_request_id and status='processing' and avatar_removed_at is not null and auth_disabled_at is not null;
 if found then insert into public.audit_events(actor_id,action,target_type,target_id)values(auth.uid(),'privacy.cleanup_completed','privacy_request',p_request_id);end if;
end;$$;
revoke all on function public.record_account_cleanup_step(uuid,text,boolean) from public,anon;
grant execute on function public.record_account_cleanup_step(uuid,text,boolean) to authenticated;

alter table public.refund_requests add column external_reference text check(char_length(external_reference) between 3 and 160);
create function public.record_manual_refund_completion(p_refund_id uuid,p_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare request_row public.refund_requests%rowtype;target public.orders%rowtype;
begin
 select * into request_row from public.refund_requests where id=p_refund_id for update;
 if not found then raise exception 'Refund request not found';end if;
 select * into target from public.orders where id=request_row.order_id for update;
 if auth.uid() is null or not public.can_manage_event(target.event_id) then raise exception 'Not authorized';end if;
 if request_row.status='completed' then return;end if;
 if request_row.status<>'approved' or target.processing_mode<>'manual_review' then raise exception 'Approve a manual refund before recording its completion';end if;
 if p_reference is null or char_length(trim(p_reference)) not between 3 and 160 then raise exception 'Add the confirmed transfer reference';end if;
 update public.refund_requests set status='completed',external_reference=trim(p_reference),completed_at=now(),updated_at=now() where id=p_refund_id;
 update public.orders set status='refunded',updated_at=now() where id=target.id;
 update public.entitlements set status='revoked',revoked_at=now() where order_id=target.id and status='active';
 update public.event_memberships set status='cancelled',updated_at=now() where order_id=target.id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'refund.manual_completed','order',target.id,jsonb_build_object('refund_request_id',p_refund_id,'external_reference',trim(p_reference)));
end;$$;
revoke all on function public.record_manual_refund_completion(uuid,text) from public,anon;
grant execute on function public.record_manual_refund_completion(uuid,text) to authenticated;
revoke all on function public.review_refund_request(uuid,text,text) from public,anon;
grant execute on function public.review_refund_request(uuid,text,text) to authenticated;
create or replace function public.execute_account_deletion(p_request_id uuid)
returns uuid language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();target public.privacy_requests%rowtype;
begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 select *into target from public.privacy_requests where id=p_request_id and request_type='deletion'and status in('approved','processing','completed')for update;
 if not found or target.scheduled_for is null or target.scheduled_for>now()then raise exception'Approved deletion request is not ready';end if;
 if target.status in('processing','completed')then return target.user_id;end if;
 if exists(select 1 from public.user_roles where user_id=target.user_id)then raise exception'Team roles must be removed before deletion';end if;
 update public.connections set status='cancelled',responded_at=coalesce(responded_at,now()),updated_at=now()where target.user_id in(user_low,user_high);delete from public.member_connection_codes where user_id=target.user_id;delete from public.member_blocks where target.user_id in(blocker_id,blocked_id);
 update public.messages set body='Message removed',status='deleted',deleted_at=coalesce(deleted_at,now())where sender_id=target.user_id;
 update public.support_tickets set subject='Deleted account request',description='Personal content removed following account deletion.',updated_at=now()where requester_id=target.user_id;
 update public.support_messages set body='Personal content removed following account deletion.'where author_id=target.user_id;
 update public.registration_requests set attendee_note=null,updated_at=now()where user_id=target.user_id;
 update public.manual_payment_reviews set submitted_reference=null,submitter_note=null,updated_at=now()where order_id in(select id from public.orders where user_id=target.user_id);
 delete from public.profile_private where user_id=target.user_id;delete from public.profile_interests where user_id=target.user_id;delete from public.member_goals where user_id=target.user_id;
 update public.profiles set display_name='Deleted member',avatar_url=null,job_title=null,company=null,industry=null,country=null,bio=null,visibility_paused=true,city=null,languages=array[]::text[],business_name=null,website_url=null,referral_source=null,avatar_path=null,profile_completion=0,access_status='deleted',updated_at=now()where id=target.user_id;
 update public.privacy_requests set status='processing',anonymized_at=now(),completed_at=null,reviewed_by=actor,updated_at=now()where id=target.id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'privacy.anonymization_completed','privacy_request',target.id,jsonb_build_object('request_user_id',target.user_id,'financial_records_retained',true));
 return target.user_id;
end;$$;
revoke all on function public.execute_account_deletion(uuid) from public,anon;
grant execute on function public.execute_account_deletion(uuid) to authenticated;
commit;
