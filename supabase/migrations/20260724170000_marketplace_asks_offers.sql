begin;

create table public.marketplace_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null check (post_type in ('ask','offer')),
  category text not null check (category in ('business','career','funding','mentorship','services','partnerships','events','other')),
  title text not null check (char_length(title) between 8 and 120),
  body text not null check (char_length(body) between 20 and 3000),
  industry text check (industry is null or char_length(industry) <= 100),
  location text check (location is null or char_length(location) <= 120),
  delivery_mode text not null default 'hybrid' check (delivery_mode in ('online','in_person','hybrid')),
  status text not null default 'published' check (status in ('published','closed','hidden','archived')),
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketplace_responses (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.marketplace_posts(id) on delete cascade,
  responder_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 10 and 1500),
  status text not null default 'sent' check (status in ('sent','accepted','declined','withdrawn')),
  responded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (post_id, responder_id)
);

create table public.marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.marketplace_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('spam','misrepresentation','privacy','safety','prohibited','other')),
  details text not null check (char_length(details) between 10 and 2000),
  evidence_snapshot jsonb not null,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  assigned_to uuid references auth.users(id) on delete set null,
  outcome text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketplace_posts_feed_idx on public.marketplace_posts(status, created_at desc);
create index marketplace_posts_filter_idx on public.marketplace_posts(post_type, category, status, created_at desc);
create index marketplace_posts_author_idx on public.marketplace_posts(author_id, created_at desc);
create index marketplace_responses_post_idx on public.marketplace_responses(post_id, status, responded_at desc);
create index marketplace_responses_member_idx on public.marketplace_responses(responder_id, responded_at desc);
create unique index marketplace_reports_one_active_idx on public.marketplace_reports(reporter_id, post_id) where status in ('open','reviewing');
create index marketplace_reports_queue_idx on public.marketplace_reports(status, created_at);

alter table public.marketplace_posts enable row level security;
alter table public.marketplace_responses enable row level security;
alter table public.marketplace_reports enable row level security;

create policy "Active members read safe marketplace posts" on public.marketplace_posts
  for select to authenticated using (
    author_id = auth.uid()
    or (
      status in ('published','closed')
      and public.is_active_member(auth.uid())
      and public.is_active_member(author_id)
      and not public.is_blocked_pair(auth.uid(), author_id)
    )
  );
create policy "Members read marketplace responses in their conversations" on public.marketplace_responses
  for select to authenticated using (
    responder_id = auth.uid()
    or exists (select 1 from public.marketplace_posts p where p.id = post_id and p.author_id = auth.uid())
  );
create policy "Members read own marketplace reports" on public.marketplace_reports
  for select to authenticated using (reporter_id = auth.uid());

create or replace function public.save_marketplace_post(
  p_post_id uuid,
  p_post_type text,
  p_category text,
  p_title text,
  p_body text,
  p_industry text,
  p_location text,
  p_delivery_mode text,
  p_closes_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); saved uuid := p_post_id; target public.marketplace_posts%rowtype;
begin
  if not public.is_active_member(actor) then raise exception 'Active membership required'; end if;
  if p_post_type not in ('ask','offer') then raise exception 'Choose Ask or Offer'; end if;
  if p_category not in ('business','career','funding','mentorship','services','partnerships','events','other') then raise exception 'Unsupported category'; end if;
  if p_delivery_mode not in ('online','in_person','hybrid') then raise exception 'Unsupported delivery mode'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 8 and 120 then raise exception 'Title must be between 8 and 120 characters'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 20 and 3000 then raise exception 'Description must be between 20 and 3000 characters'; end if;
  if p_closes_at is not null and p_closes_at <= now() + interval '1 hour' then raise exception 'Closing time must be in the future'; end if;
  if p_post_id is null then
    if (select count(*) from public.marketplace_posts where author_id=actor and created_at>now()-interval '24 hours') >= 5 then raise exception 'Daily post limit reached'; end if;
    insert into public.marketplace_posts(author_id,post_type,category,title,body,industry,location,delivery_mode,closes_at)
    values(actor,p_post_type,p_category,trim(p_title),trim(p_body),nullif(trim(p_industry),''),nullif(trim(p_location),''),p_delivery_mode,p_closes_at) returning id into saved;
  else
    select * into target from public.marketplace_posts where id=p_post_id and author_id=actor for update;
    if not found then raise exception 'Post not found'; end if;
    if target.status not in ('published','closed') then raise exception 'This post can no longer be edited'; end if;
    update public.marketplace_posts set post_type=p_post_type,category=p_category,title=trim(p_title),body=trim(p_body),industry=nullif(trim(p_industry),''),location=nullif(trim(p_location),''),delivery_mode=p_delivery_mode,closes_at=p_closes_at,updated_at=now() where id=p_post_id;
  end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,case when p_post_id is null then 'marketplace.post_created' else 'marketplace.post_updated' end,'marketplace_post',saved,jsonb_build_object('type',p_post_type,'category',p_category));
  return saved;
end; $$;

create or replace function public.set_marketplace_post_status(p_post_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); target public.marketplace_posts%rowtype;
begin
  select * into target from public.marketplace_posts where id=p_post_id and author_id=actor for update;
  if not found then raise exception 'Post not found'; end if;
  if p_status not in ('published','closed','archived') then raise exception 'Unsupported status'; end if;
  if target.status='hidden' then raise exception 'A moderated post cannot be changed'; end if;
  update public.marketplace_posts set status=p_status,closed_at=case when p_status='closed' then now() else null end,updated_at=now() where id=p_post_id;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'marketplace.post_status_changed','marketplace_post',p_post_id,jsonb_build_object('from',target.status,'to',p_status));
end; $$;

create or replace function public.list_marketplace_posts(p_search text default null,p_post_type text default null,p_category text default null,p_limit integer default 24,p_offset integer default 0)
returns table(post_id uuid,author_id uuid,author_name text,author_role text,author_company text,author_city text,post_type text,category text,title text,body text,industry text,location text,delivery_mode text,status text,closes_at timestamptz,response_count bigint,own_response_status text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$ begin
  if not public.is_active_member(auth.uid()) then raise exception 'Active membership required'; end if;
  return query select p.id,p.author_id,coalesce(pr.display_name,'Member'),pr.job_title,pr.company,pr.city,p.post_type,p.category,p.title,p.body,p.industry,p.location,p.delivery_mode,p.status,p.closes_at,
    (select count(*) from public.marketplace_responses r where r.post_id=p.id and r.status<>'withdrawn'),
    (select r.status from public.marketplace_responses r where r.post_id=p.id and r.responder_id=auth.uid()),p.created_at,p.updated_at
  from public.marketplace_posts p join public.profiles pr on pr.id=p.author_id
  where (p.author_id=auth.uid() or (p.status in('published','closed') and pr.access_status='active' and not pr.visibility_paused and not public.is_blocked_pair(auth.uid(),p.author_id)))
    and (nullif(trim(p_search),'') is null or concat_ws(' ',p.title,p.body,p.industry,p.location,pr.display_name,pr.company) ilike '%'||trim(p_search)||'%')
    and (nullif(trim(p_post_type),'') is null or p.post_type=p_post_type)
    and (nullif(trim(p_category),'') is null or p.category=p_category)
    and p.status<>'archived' and p.status<>'hidden'
  order by case when p.status='published' then 0 else 1 end,p.created_at desc
  limit least(greatest(coalesce(p_limit,24),1),50) offset greatest(coalesce(p_offset,0),0);
end; $$;

create or replace function public.respond_to_marketplace_post(p_post_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); target public.marketplace_posts%rowtype; saved uuid;
begin
  if not public.is_active_member(actor) then raise exception 'Active membership required'; end if;
  select * into target from public.marketplace_posts where id=p_post_id and status='published' and (closes_at is null or closes_at>now()) for update;
  if not found or target.author_id=actor or not public.is_active_member(target.author_id) or public.is_blocked_pair(actor,target.author_id) then raise exception 'Post is unavailable'; end if;
  if char_length(trim(coalesce(p_message,''))) not between 10 and 1500 then raise exception 'Response must be between 10 and 1500 characters'; end if;
  if (select count(*) from public.marketplace_responses where responder_id=actor and responded_at>now()-interval '24 hours')>=20 then raise exception 'Daily response limit reached'; end if;
  insert into public.marketplace_responses(post_id,responder_id,message) values(p_post_id,actor,trim(p_message))
  on conflict(post_id,responder_id) do update set message=excluded.message,status='sent',responded_at=now(),reviewed_at=null,updated_at=now() where marketplace_responses.status in('declined','withdrawn') returning id into saved;
  if saved is null then raise exception 'You already responded to this post'; end if;
  perform public.enqueue_notification(target.author_id,'network','New response to your '||target.post_type,'A member responded to “'||target.title||'”.','/opportunities?mine=1','marketplace-response:'||saved);
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'marketplace.response_sent','marketplace_response',saved,jsonb_build_object('post_id',p_post_id));
  return saved;
end; $$;

create or replace function public.list_marketplace_responses(p_post_id uuid)
returns table(response_id uuid,responder_id uuid,responder_name text,responder_role text,responder_company text,message text,status text,responded_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); owner uuid;
begin
  select author_id into owner from public.marketplace_posts where id=p_post_id;
  if owner is null or (actor<>owner and not exists(select 1 from public.marketplace_responses mr where mr.post_id=p_post_id and mr.responder_id=actor)) then raise exception 'Not authorized'; end if;
  return query select r.id,r.responder_id,p.display_name,p.job_title,p.company,r.message,r.status,r.responded_at from public.marketplace_responses r join public.profiles p on p.id=r.responder_id where r.post_id=p_post_id and (actor=owner or r.responder_id=actor) order by r.responded_at desc;
end; $$;

create or replace function public.review_marketplace_response(p_response_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); target public.marketplace_responses%rowtype; post public.marketplace_posts%rowtype;
begin
  if p_status not in('accepted','declined') then raise exception 'Unsupported response status'; end if;
  select * into target from public.marketplace_responses where id=p_response_id for update;
  select * into post from public.marketplace_posts where id=target.post_id and author_id=actor;
  if not found or target.status<>'sent' then raise exception 'Response not found'; end if;
  update public.marketplace_responses set status=p_status,reviewed_at=now(),updated_at=now() where id=p_response_id;
  perform public.enqueue_notification(target.responder_id,'network','Your response was '||p_status,'The owner updated your response to “'||post.title||'”.','/opportunities?mine=1','marketplace-response-status:'||target.id||':'||p_status);
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'marketplace.response_'||p_status,'marketplace_response',target.id,jsonb_build_object('post_id',post.id));
end; $$;

create or replace function public.withdraw_marketplace_response(p_response_id uuid)
returns void language plpgsql security definer set search_path = '' as $$ begin
  update public.marketplace_responses set status='withdrawn',updated_at=now() where id=p_response_id and responder_id=auth.uid() and status in('sent','accepted');
  if not found then raise exception 'Response not found'; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'marketplace.response_withdrawn','marketplace_response',p_response_id);
end; $$;

create or replace function public.report_marketplace_post(p_post_id uuid,p_category text,p_details text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); target public.marketplace_posts%rowtype;saved uuid;snapshot jsonb;
begin
  if not public.is_active_member(actor) then raise exception 'Active membership required'; end if;
  select * into target from public.marketplace_posts where id=p_post_id and author_id<>actor and status in('published','closed');
  if not found or public.is_blocked_pair(actor,target.author_id) then raise exception 'Post is unavailable'; end if;
  if p_category not in('spam','misrepresentation','privacy','safety','prohibited','other') or char_length(trim(coalesce(p_details,'')))<10 then raise exception 'Valid category and details are required'; end if;
  if (select count(*) from public.marketplace_reports where reporter_id=actor and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily report limit reached'; end if;
  snapshot:=jsonb_build_object('post_id',target.id,'author_id',target.author_id,'type',target.post_type,'category',target.category,'title',target.title,'body',target.body,'status',target.status,'captured_at',now());
  insert into public.marketplace_reports(post_id,reporter_id,category,details,evidence_snapshot) values(p_post_id,actor,p_category,trim(p_details),snapshot) returning id into saved;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'marketplace.post_reported','marketplace_report',saved,jsonb_build_object('post_id',p_post_id,'category',p_category));
  return saved;
exception when unique_violation then raise exception 'You already have an active report for this post';
end; $$;

create or replace function public.list_marketplace_reports()
returns table(report_id uuid,post_id uuid,reporter_id uuid,reporter_email text,category text,details text,evidence_snapshot jsonb,status text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$ begin
  if not public.is_admin(array['super_admin','moderator']::public.app_role[]) then raise exception 'Moderator role required'; end if;
  return query select r.id,r.post_id,r.reporter_id,u.email::text,r.category,r.details,r.evidence_snapshot,r.status,r.created_at from public.marketplace_reports r join auth.users u on u.id=r.reporter_id order by case r.status when'open'then 0 when'reviewing'then 1 else 2 end,r.created_at desc;
end; $$;

create or replace function public.review_marketplace_report(p_report_id uuid,p_action text,p_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid();target public.marketplace_reports%rowtype;
begin
  if not public.is_admin(array['super_admin','moderator']::public.app_role[]) then raise exception 'Moderator role required'; end if;
  if p_action not in('start_review','hide','dismiss') then raise exception 'Unsupported action'; end if;
  if p_action<>'start_review' and char_length(trim(coalesce(p_outcome,'')))<5 then raise exception 'Record a moderation outcome'; end if;
  select * into target from public.marketplace_reports where id=p_report_id for update;
  if not found or target.status not in('open','reviewing') then raise exception 'Active report not found'; end if;
  update public.marketplace_reports set status=case p_action when'start_review'then'reviewing'when'hide'then'resolved'else'dismissed'end,assigned_to=actor,outcome=case when p_action='start_review'then outcome else trim(p_outcome)end,reviewed_at=case when p_action='start_review'then reviewed_at else now()end,updated_at=now() where id=p_report_id;
  if p_action='hide' then update public.marketplace_posts set status='hidden',updated_at=now() where id=target.post_id; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'marketplace.report_'||p_action,'marketplace_report',target.id,jsonb_build_object('post_id',target.post_id,'outcome',nullif(trim(p_outcome),'')));
end; $$;

revoke all on function public.save_marketplace_post(uuid,text,text,text,text,text,text,text,timestamptz) from public; grant execute on function public.save_marketplace_post(uuid,text,text,text,text,text,text,text,timestamptz) to authenticated;
revoke all on function public.set_marketplace_post_status(uuid,text) from public; grant execute on function public.set_marketplace_post_status(uuid,text) to authenticated;
revoke all on function public.list_marketplace_posts(text,text,text,integer,integer) from public; grant execute on function public.list_marketplace_posts(text,text,text,integer,integer) to authenticated;
revoke all on function public.respond_to_marketplace_post(uuid,text) from public; grant execute on function public.respond_to_marketplace_post(uuid,text) to authenticated;
revoke all on function public.list_marketplace_responses(uuid) from public; grant execute on function public.list_marketplace_responses(uuid) to authenticated;
revoke all on function public.review_marketplace_response(uuid,text) from public; grant execute on function public.review_marketplace_response(uuid,text) to authenticated;
revoke all on function public.withdraw_marketplace_response(uuid) from public; grant execute on function public.withdraw_marketplace_response(uuid) to authenticated;
revoke all on function public.report_marketplace_post(uuid,text,text) from public; grant execute on function public.report_marketplace_post(uuid,text,text) to authenticated;
revoke all on function public.list_marketplace_reports() from public; grant execute on function public.list_marketplace_reports() to authenticated;
revoke all on function public.review_marketplace_report(uuid,text,text) from public; grant execute on function public.review_marketplace_report(uuid,text,text) to authenticated;

do $$begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='marketplace_posts') then alter publication supabase_realtime add table public.marketplace_posts; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='marketplace_responses') then alter publication supabase_realtime add table public.marketplace_responses; end if;
  end if;
end$$;

comment on table public.marketplace_posts is 'Member asks and offers visible only within the active, unblocked network.';
comment on table public.marketplace_responses is 'Private response threads shared only with the responder and post owner.';
comment on function public.list_marketplace_reports is 'Report-scoped moderation feed; moderators do not receive general marketplace browsing authority.';

commit;
