begin;

create table public.privacy_requests(
 id uuid primary key default gen_random_uuid(),reference text not null unique default('PRV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
 user_id uuid not null references auth.users(id) on delete restrict,request_type text not null check(request_type in('deletion','correction','restriction','objection')),
 reason text check(reason is null or char_length(reason)<=2000),status text not null default'submitted' check(status in('submitted','in_review','approved','rejected','completed','cancelled')),
 prior_visibility_paused boolean not null default false,scheduled_for timestamptz,reviewed_by uuid references auth.users(id) on delete set null,reviewer_note text check(reviewer_note is null or char_length(reviewer_note)<=2000),
 reviewed_at timestamptz,completed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index privacy_requests_open_deletion_idx on public.privacy_requests(user_id)where request_type='deletion'and status in('submitted','in_review','approved');
create index privacy_requests_admin_queue_idx on public.privacy_requests(status,request_type,created_at);
create table public.privacy_export_events(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now());
create index privacy_export_events_rate_idx on public.privacy_export_events(user_id,created_at desc);
alter table public.privacy_requests enable row level security;alter table public.privacy_export_events enable row level security;
create policy "Members read own privacy requests"on public.privacy_requests for select to authenticated using(user_id=auth.uid());
create policy "Super admins read privacy requests"on public.privacy_requests for select to authenticated using(public.is_admin(array['super_admin']::public.app_role[]));
create policy "Members read own export history"on public.privacy_export_events for select to authenticated using(user_id=auth.uid());

create or replace function public.set_profile_visibility(p_paused boolean)
returns void language plpgsql security definer set search_path=''as $$begin
 if auth.uid()is null then raise exception'Authentication required';end if;
 if not p_paused and exists(select 1 from public.privacy_requests where user_id=auth.uid()and request_type='deletion'and status in('submitted','in_review','approved'))then raise exception'Cancel the active deletion request before restoring visibility';end if;
 update public.profiles set visibility_paused=p_paused,updated_at=now()where id=auth.uid()and access_status<>'deleted';if not found then raise exception'Account is unavailable';end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'privacy.visibility_changed','profile',auth.uid(),jsonb_build_object('paused',p_paused));
end;$$;

create or replace function public.request_account_deletion(p_confirmation text,p_reason text)
returns uuid language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();saved uuid;paused boolean;
begin
 if actor is null then raise exception'Authentication required';end if;
 if upper(trim(coalesce(p_confirmation,'')))<>'DELETE' then raise exception'Type DELETE to confirm';end if;
 if public.is_admin(array['super_admin','event_staff','moderator','sponsor']::public.app_role[])then raise exception'Team roles must be transferred or removed before account deletion';end if;
 select visibility_paused into paused from public.profiles where id=actor and access_status<>'deleted'for update;
 if not found then raise exception'Account is unavailable';end if;
 insert into public.privacy_requests(user_id,request_type,reason,prior_visibility_paused,scheduled_for)values(actor,'deletion',nullif(trim(p_reason),''),paused,now()+interval'7 days')returning id into saved;
 update public.profiles set visibility_paused=true,updated_at=now()where id=actor;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'privacy.deletion_requested','privacy_request',saved,jsonb_build_object('scheduled_for',now()+interval'7 days'));
 return saved;
end;$$;

create or replace function public.cancel_account_deletion(p_request_id uuid)
returns void language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();target public.privacy_requests%rowtype;
begin
 select *into target from public.privacy_requests where id=p_request_id and user_id=actor and request_type='deletion'and status in('submitted','in_review','approved')for update;
 if not found then raise exception'Deletion request cannot be cancelled';end if;
 update public.privacy_requests set status='cancelled',updated_at=now()where id=target.id;
 update public.profiles set visibility_paused=target.prior_visibility_paused,updated_at=now()where id=actor and access_status<>'deleted';
 insert into public.audit_events(actor_id,action,target_type,target_id)values(actor,'privacy.deletion_cancelled','privacy_request',target.id);
end;$$;

create or replace function public.get_my_data_export()
returns jsonb language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();result jsonb;
begin
 if actor is null then raise exception'Authentication required';end if;
 if(select count(*)from public.privacy_export_events where user_id=actor and created_at>now()-interval'24 hours')>=3 then raise exception'Daily export limit reached';end if;
 select jsonb_build_object(
  'generated_at',now(),'account',(select jsonb_build_object('user_id',u.id,'email',u.email,'created_at',u.created_at)from auth.users u where u.id=actor),
  'profile',(select to_jsonb(p)from public.profiles p where p.id=actor),'private_profile',(select to_jsonb(pp)from public.profile_private pp where pp.user_id=actor),
  'interests',coalesce((select jsonb_agg(to_jsonb(i))from public.profile_interests i where i.user_id=actor),'[]'::jsonb),'goals',coalesce((select jsonb_agg(to_jsonb(g))from public.member_goals g where g.user_id=actor),'[]'::jsonb),
  'consents',coalesce((select jsonb_agg(to_jsonb(c))from public.consent_records c where c.user_id=actor),'[]'::jsonb),
  'orders',coalesce((select jsonb_agg(jsonb_build_object('reference',o.reference,'event',e.title,'status',o.status,'processing_mode',o.processing_mode,'currency',o.currency,'total_minor',o.total_minor,'created_at',o.created_at))from public.orders o join public.events e on e.id=o.event_id where o.user_id=actor),'[]'::jsonb),
  'registrations',coalesce((select jsonb_agg(to_jsonb(r))from public.registration_requests r where r.user_id=actor),'[]'::jsonb),
  'connections',coalesce((select jsonb_agg(to_jsonb(c))from public.connections c where actor in(c.user_low,c.user_high)),'[]'::jsonb),
  'messages_authored',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'body',case when m.status='deleted'then'Message removed'else m.body end,'status',m.status,'created_at',m.created_at))from public.messages m where m.sender_id=actor),'[]'::jsonb),
  'support_requests',coalesce((select jsonb_agg(to_jsonb(t))from public.support_tickets t where t.requester_id=actor),'[]'::jsonb),
  'support_replies',coalesce((select jsonb_agg(to_jsonb(sm))from public.support_messages sm join public.support_tickets st on st.id=sm.ticket_id where st.requester_id=actor),'[]'::jsonb),
  'privacy_requests',coalesce((select jsonb_agg(to_jsonb(pr))from public.privacy_requests pr where pr.user_id=actor),'[]'::jsonb)
 )into result;
 insert into public.privacy_export_events(user_id)values(actor);
 insert into public.audit_events(actor_id,action,target_type,metadata)values(actor,'privacy.export_generated','account',jsonb_build_object('format','json'));
 return result;
end;$$;

create or replace function public.list_admin_privacy_requests()
returns table(request_id uuid,reference text,user_id uuid,email text,display_name text,request_type text,reason text,status text,scheduled_for timestamptz,reviewer_note text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=''as $$begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 return query select r.id,r.reference,r.user_id,u.email::text,p.display_name,r.request_type,r.reason,r.status,r.scheduled_for,r.reviewer_note,r.created_at,r.updated_at from public.privacy_requests r join auth.users u on u.id=r.user_id left join public.profiles p on p.id=r.user_id order by case r.status when'submitted'then 0 when'in_review'then 1 when'approved'then 2 else 3 end,r.created_at;
end;$$;

create or replace function public.manage_privacy_request(p_request_id uuid,p_action text,p_note text)
returns void language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();target public.privacy_requests%rowtype;next_status text;
begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 select *into target from public.privacy_requests where id=p_request_id for update;if not found then raise exception'Privacy request not found';end if;
 next_status:=case p_action when'start_review'then'in_review'when'approve'then'approved'when'reject'then'rejected'else null end;
 if next_status is null then raise exception'Unsupported privacy action';end if;
 if(p_action='start_review'and target.status<>'submitted')or(p_action in('approve','reject')and target.status not in('submitted','in_review'))then raise exception'Invalid privacy request transition';end if;
 if p_action='reject'and nullif(trim(p_note),'')is null then raise exception'A rejection reason is required';end if;
 update public.privacy_requests set status=next_status,reviewed_by=actor,reviewer_note=nullif(trim(p_note),''),reviewed_at=now(),updated_at=now()where id=target.id;
 if p_action='reject'and target.request_type='deletion'then update public.profiles set visibility_paused=target.prior_visibility_paused,updated_at=now()where id=target.user_id;end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'privacy.'||p_action,'privacy_request',target.id,jsonb_build_object('request_user_id',target.user_id));
end;$$;

create or replace function public.execute_account_deletion(p_request_id uuid)
returns uuid language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();target public.privacy_requests%rowtype;
begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 select *into target from public.privacy_requests where id=p_request_id and request_type='deletion'and status in('approved','completed')for update;
 if not found or target.scheduled_for>now()then raise exception'Approved deletion request is not ready';end if;
 if target.status='completed'then return target.user_id;end if;
 if exists(select 1 from public.user_roles where user_id=target.user_id)then raise exception'Team roles must be removed before deletion';end if;
 update public.connections set status='cancelled',responded_at=coalesce(responded_at,now()),updated_at=now()where target.user_id in(user_low,user_high);delete from public.member_connection_codes where user_id=target.user_id;delete from public.member_blocks where target.user_id in(blocker_id,blocked_id);
 update public.messages set body='Message removed',status='deleted',deleted_at=coalesce(deleted_at,now())where sender_id=target.user_id;
 update public.support_tickets set subject='Deleted account request',description='Personal content removed following account deletion.',updated_at=now()where requester_id=target.user_id;
 update public.support_messages set body='Personal content removed following account deletion.'where author_id=target.user_id;
 update public.registration_requests set attendee_note=null,updated_at=now()where user_id=target.user_id;
 update public.manual_payment_reviews set submitted_reference=null,submitter_note=null,updated_at=now()where order_id in(select id from public.orders where user_id=target.user_id);
 delete from public.profile_private where user_id=target.user_id;delete from public.profile_interests where user_id=target.user_id;delete from public.member_goals where user_id=target.user_id;
 update public.profiles set display_name='Deleted member',avatar_url=null,job_title=null,company=null,industry=null,country=null,bio=null,visibility_paused=true,city=null,languages=array[]::text[],business_name=null,website_url=null,referral_source=null,avatar_path=null,profile_completion=0,access_status='deleted',updated_at=now()where id=target.user_id;
 update public.privacy_requests set status='completed',completed_at=now(),reviewed_by=actor,updated_at=now()where id=target.id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'privacy.deletion_executed','privacy_request',target.id,jsonb_build_object('request_user_id',target.user_id,'financial_records_retained',true));
 return target.user_id;
end;$$;

revoke all on function public.set_profile_visibility(boolean)from public;grant execute on function public.set_profile_visibility(boolean)to authenticated;
revoke all on function public.request_account_deletion(text,text)from public;grant execute on function public.request_account_deletion(text,text)to authenticated;
revoke all on function public.cancel_account_deletion(uuid)from public;grant execute on function public.cancel_account_deletion(uuid)to authenticated;
revoke all on function public.get_my_data_export()from public;grant execute on function public.get_my_data_export()to authenticated;
revoke all on function public.list_admin_privacy_requests()from public;grant execute on function public.list_admin_privacy_requests()to authenticated;
revoke all on function public.manage_privacy_request(uuid,text,text)from public;grant execute on function public.manage_privacy_request(uuid,text,text)to authenticated;
revoke all on function public.execute_account_deletion(uuid)from public;grant execute on function public.execute_account_deletion(uuid)to authenticated;

commit;
