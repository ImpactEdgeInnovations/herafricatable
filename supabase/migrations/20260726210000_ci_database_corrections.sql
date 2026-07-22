begin;

create or replace function public.ensure_connection_code()
returns text language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();saved text;candidate text;
begin
 if not public.is_active_member(actor)then raise exception'Active visible membership required';end if;
 select c.code into saved from public.member_connection_codes c where c.user_id=actor;
 if saved is not null then return saved;end if;
 loop
  candidate:=upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,8));
  begin
   insert into public.member_connection_codes(user_id,code)values(actor,candidate)returning code into saved;
   exit;
  exception when unique_violation then end;
 end loop;
 return saved;
end;$$;

create or replace function public.ensure_referral_code(p_campaign_id uuid)
returns text language plpgsql security definer set search_path=''as $$
declare saved text;candidate text;campaign public.referral_campaigns%rowtype;
begin
 if not public.referrals_enabled()or not public.is_active_member(auth.uid())then raise exception'Referrals are unavailable';end if;
 select c.*into campaign from public.referral_campaigns c where c.id=p_campaign_id and c.status='active'and(c.starts_at is null or c.starts_at<=now())and(c.ends_at is null or c.ends_at>now());
 if not found then raise exception'Campaign is not active';end if;
 select rc.code into saved from public.referral_codes rc where rc.campaign_id=p_campaign_id and rc.referrer_id=auth.uid()and rc.status='active';
 if saved is not null then return saved;end if;
 loop
  candidate:=upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,10));
  begin
   insert into public.referral_codes(campaign_id,referrer_id,code)values(p_campaign_id,auth.uid(),candidate)returning code into saved;
   exit;
  exception when unique_violation then end;
 end loop;
 return saved;
end;$$;

create or replace function public.get_launch_readiness_metrics()
returns table(metric_key text,label text,description text,direction text,current_value bigint,target_value bigint,status text,sort_order integer)
language plpgsql stable security definer set search_path=''as $$
begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 return query with values_now as(
  select'real_active_members'::text key,count(*)::bigint value from public.profiles p where p.access_status='active'and not p.is_test_account union all
  select'completed_onboarding',count(*)::bigint from public.profiles p where p.access_status='active'and not p.is_test_account and p.onboarding_completed_at is not null and p.profile_completion=100 union all
  select'published_events',count(*)::bigint from public.events e where e.status='published' union all
  select'available_tickets',count(*)::bigint from public.ticket_types tt join public.events e on e.id=tt.event_id where tt.status='on_sale'and e.status='published'and(tt.sales_start_at is null or tt.sales_start_at<=now())and(tt.sales_end_at is null or tt.sales_end_at>now()) union all
  select'fulfilled_orders',count(*)::bigint from public.orders o join public.profiles p on p.id=o.user_id where o.status='fulfilled'and not p.is_test_account union all
  select'accepted_connections',count(*)::bigint from public.connections c join public.profiles a on a.id=c.user_low join public.profiles b on b.id=c.user_high where c.status='accepted'and not a.is_test_account and not b.is_test_account union all
  select'monthly_active_members',count(distinct pe.actor_id)::bigint from public.product_events pe where pe.occurred_at>=now()-interval'30 days'and not pe.is_test_event union all
  select'failed_notifications',count(*)::bigint from public.notification_jobs nj where nj.status='failed' union all
  select'payment_event_errors',count(*)::bigint from public.payment_events pe where pe.error_message is not null union all
  select'open_safety_reports',(select count(*)from public.member_reports mr where mr.status in('open','reviewing'))+(select count(*)from public.marketplace_reports mr where mr.status in('open','reviewing'))+(select count(*)from public.community_post_reports cr where cr.status in('open','reviewing'))
 )
 select t.metric_key,t.label,t.description,t.direction,coalesce(v.value,0),t.target_value,
  case when(t.direction='minimum'and coalesce(v.value,0)>=t.target_value)or(t.direction='maximum'and coalesce(v.value,0)<=t.target_value)then'ready'else'action_required'end,
  t.sort_order
 from public.launch_readiness_targets t left join values_now v on v.key=t.metric_key order by t.sort_order;
end;$$;

commit;
