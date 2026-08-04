begin;

create table if not exists public.community_check_in_reports (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.community_check_ins(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  category text not null
    check (category in ('harassment', 'privacy', 'spam', 'misinformation', 'safety', 'other')),
  details text not null check (char_length(details) between 10 and 2000),
  evidence_snapshot jsonb not null,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_to uuid references auth.users(id) on delete set null,
  outcome text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists community_check_in_reports_active_idx
  on public.community_check_in_reports (check_in_id, reporter_id)
  where status in ('open', 'reviewing');
create index if not exists community_check_in_reports_queue_idx
  on public.community_check_in_reports (status, created_at);

alter table public.community_check_in_reports enable row level security;
revoke all on table public.community_check_in_reports from anon, authenticated;

create or replace function public.report_community_check_in(
  p_check_in_id uuid,
  p_category text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_check_ins%rowtype;
  saved uuid;
  captured_options jsonb;
begin
  if not public.communities_enabled() or not public.is_active_member(actor) then
    raise exception 'Communities are unavailable';
  end if;
  select * into target
  from public.community_check_ins check_in
  where check_in.id = p_check_in_id
    and check_in.status <> 'removed';
  if not found
    or target.creator_id = actor
    or not exists (
      select 1 from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.user_id = actor
        and membership.status = 'active'
    )
  then
    raise exception 'Check-in unavailable';
  end if;
  if p_category not in ('harassment', 'privacy', 'spam', 'misinformation', 'safety', 'other')
    or char_length(trim(coalesce(p_details, ''))) not between 10 and 2000
  then
    raise exception 'Valid report details are required';
  end if;

  select jsonb_agg(
    jsonb_build_object('label', option.label, 'position', option.position)
    order by option.position
  ) into captured_options
  from public.community_check_in_options option
  where option.check_in_id = target.id;

  insert into public.community_check_in_reports (
    check_in_id,
    reporter_id,
    category,
    details,
    evidence_snapshot
  ) values (
    target.id,
    actor,
    p_category,
    trim(p_details),
    jsonb_build_object(
      'check_in_id', target.id,
      'community_id', target.community_id,
      'creator_id', target.creator_id,
      'question', target.question,
      'options', coalesce(captured_options, '[]'::jsonb),
      'captured_at', now()
    )
  ) returning id into saved;

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  ) values (
    actor,
    'community.check_in_reported',
    'community_check_in_report',
    saved,
    jsonb_build_object('check_in_id', target.id)
  );
  return saved;
exception when unique_violation then
  raise exception 'You already have an active report for this check-in';
end;
$$;

create or replace function public.list_community_safety_reports()
returns table (
  report_id uuid,
  content_type text,
  community_id uuid,
  community_name text,
  reporter_email text,
  category text,
  details text,
  evidence_snapshot jsonb,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin', 'moderator']::public.app_role[]) then
    raise exception 'Moderator role required';
  end if;
  insert into public.audit_events (
    actor_id, action, target_type, metadata
  ) values (
    auth.uid(),
    'community.report_queue_accessed',
    'community_reports',
    jsonb_build_object('accessed_at', now())
  );

  return query
  select * from (
    select
      report.id,
      'post'::text,
      post.community_id,
      community.name,
      account.email::text,
      report.category,
      report.details,
      report.evidence_snapshot,
      report.status,
      report.created_at
    from public.community_post_reports report
    join public.community_posts post on post.id = report.post_id
    join public.communities community on community.id = post.community_id
    join auth.users account on account.id = report.reporter_id

    union all

    select
      report.id,
      'check_in'::text,
      check_in.community_id,
      community.name,
      account.email::text,
      report.category,
      report.details,
      report.evidence_snapshot,
      report.status,
      report.created_at
    from public.community_check_in_reports report
    join public.community_check_ins check_in on check_in.id = report.check_in_id
    join public.communities community on community.id = check_in.community_id
    join auth.users account on account.id = report.reporter_id
  ) report_queue
  order by
    case report_queue.status when 'open' then 0 when 'reviewing' then 1 else 2 end,
    report_queue.created_at;
end;
$$;

create or replace function public.review_community_safety_report(
  p_report_id uuid,
  p_content_type text,
  p_action text,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_report public.community_post_reports%rowtype;
  check_in_report public.community_check_in_reports%rowtype;
  target_id uuid;
begin
  if not public.is_admin(array['super_admin', 'moderator']::public.app_role[]) then
    raise exception 'Moderator role required';
  end if;
  if p_content_type not in ('post', 'check_in')
    or p_action not in ('start_review', 'hide', 'dismiss')
    or (p_action <> 'start_review' and char_length(trim(coalesce(p_outcome, ''))) < 5)
  then
    raise exception 'Valid moderation action and outcome required';
  end if;

  if p_content_type = 'post' then
    select * into post_report
    from public.community_post_reports report
    where report.id = p_report_id
    for update;
    if not found or post_report.status not in ('open', 'reviewing') then
      raise exception 'Active report not found';
    end if;
    target_id := post_report.post_id;
    update public.community_post_reports
    set status = case p_action when 'start_review' then 'reviewing' when 'hide' then 'resolved' else 'dismissed' end,
        assigned_to = auth.uid(),
        outcome = nullif(trim(p_outcome), ''),
        reviewed_at = case when p_action = 'start_review' then null else now() end,
        updated_at = now()
    where id = p_report_id;
    if p_action = 'hide' then
      update public.community_posts set status = 'hidden', updated_at = now()
      where id = target_id;
    end if;
  else
    select * into check_in_report
    from public.community_check_in_reports report
    where report.id = p_report_id
    for update;
    if not found or check_in_report.status not in ('open', 'reviewing') then
      raise exception 'Active report not found';
    end if;
    target_id := check_in_report.check_in_id;
    update public.community_check_in_reports
    set status = case p_action when 'start_review' then 'reviewing' when 'hide' then 'resolved' else 'dismissed' end,
        assigned_to = auth.uid(),
        outcome = nullif(trim(p_outcome), ''),
        reviewed_at = case when p_action = 'start_review' then null else now() end,
        updated_at = now()
    where id = p_report_id;
    if p_action = 'hide' then
      update public.community_check_ins
      set status = 'removed', closed_at = coalesce(closed_at, now()),
          closed_by = auth.uid(), updated_at = now()
      where id = target_id;
    end if;
  end if;

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  ) values (
    auth.uid(),
    'community.report_' || p_action,
    'community_' || p_content_type || '_report',
    p_report_id,
    jsonb_build_object(
      'content_type', p_content_type,
      'target_id', target_id,
      'outcome', nullif(trim(p_outcome), '')
    )
  );
end;
$$;

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
  select'open_safety_reports',(select count(*)from public.member_reports mr where mr.status in('open','reviewing'))+(select count(*)from public.marketplace_reports mr where mr.status in('open','reviewing'))+(select count(*)from public.community_post_reports cr where cr.status in('open','reviewing'))+(select count(*)from public.community_check_in_reports qr where qr.status in('open','reviewing'))
 )
 select t.metric_key,t.label,t.description,t.direction,coalesce(v.value,0),t.target_value,
  case when(t.direction='minimum'and coalesce(v.value,0)>=t.target_value)or(t.direction='maximum'and coalesce(v.value,0)<=t.target_value)then'ready'else'action_required'end,
  t.sort_order
 from public.launch_readiness_targets t left join values_now v on v.key=t.metric_key order by t.sort_order;
end;$$;

revoke all on function public.report_community_check_in(uuid, text, text) from public;
grant execute on function public.report_community_check_in(uuid, text, text) to authenticated;
revoke all on function public.list_community_safety_reports() from public;
grant execute on function public.list_community_safety_reports() to authenticated;
revoke all on function public.review_community_safety_report(uuid, text, text, text) from public;
grant execute on function public.review_community_safety_report(uuid, text, text, text) to authenticated;

commit;
