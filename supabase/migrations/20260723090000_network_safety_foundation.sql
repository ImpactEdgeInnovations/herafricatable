create table public.member_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text check(char_length(reason)<=500), created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id), constraint block_distinct_members check(blocker_id<>blocked_id)
);
create table public.member_reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade, connection_id uuid references public.connections(id) on delete set null,
  category text not null check(category in ('harassment','spam','misrepresentation','privacy','safety','other')),
  details text not null check(char_length(details) between 10 and 2000), evidence_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
  assigned_to uuid references auth.users(id) on delete set null, outcome text, reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint report_distinct_members check(reporter_id<>target_user_id)
);
create index member_blocks_blocked_idx on public.member_blocks(blocked_id,blocker_id);
create index member_reports_status_created_idx on public.member_reports(status,created_at);
alter table public.member_blocks enable row level security; alter table public.member_reports enable row level security;
create policy "Members read own blocks" on public.member_blocks for select to authenticated using(blocker_id=auth.uid());
create policy "Members read submitted reports" on public.member_reports for select to authenticated using(reporter_id=auth.uid());
create policy "Moderators read reports" on public.member_reports for select to authenticated using(public.is_admin(array['super_admin','moderator']::public.app_role[]));

create or replace function public.is_blocked_pair(member_a uuid,member_b uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.member_blocks where (blocker_id=member_a and blocked_id=member_b) or (blocker_id=member_b and blocked_id=member_a));
$$;

create or replace function public.remove_connection(p_connection_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.connections%rowtype;
begin
 select * into target from public.connections where id=p_connection_id and actor in (user_low,user_high) for update;
 if not found then raise exception 'Connection not found'; end if;
 update public.connections set status='cancelled',responded_at=now(),updated_at=now() where id=target.id;
 insert into public.audit_events(actor_id,action,target_type,target_id) values(actor,'connection.removed','connection',target.id);
end; $$;

create or replace function public.block_member(p_member_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); connection_id uuid;
begin
 if actor is null or actor=p_member_id or not exists(select 1 from public.profiles where id=p_member_id) then raise exception 'Member is unavailable'; end if;
 insert into public.member_blocks(blocker_id,blocked_id,reason) values(actor,p_member_id,nullif(trim(p_reason),'')) on conflict(blocker_id,blocked_id) do update set reason=excluded.reason,created_at=now();
 update public.connections set status='cancelled',responded_at=now(),updated_at=now() where user_low=least(actor,p_member_id) and user_high=greatest(actor,p_member_id) returning id into connection_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'member.blocked','profile',p_member_id,jsonb_build_object('connection_id',connection_id));
end; $$;

create or replace function public.unblock_member(p_member_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); begin
 delete from public.member_blocks where blocker_id=actor and blocked_id=p_member_id;
 if not found then raise exception 'Block not found'; end if;
 insert into public.audit_events(actor_id,action,target_type,target_id) values(actor,'member.unblocked','profile',p_member_id);
end; $$;

create or replace function public.list_my_blocks()
returns table(user_id uuid,display_name text,blocked_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 return query select b.blocked_id,p.display_name,b.created_at from public.member_blocks b left join public.profiles p on p.id=b.blocked_id where b.blocker_id=auth.uid() order by b.created_at desc;
end; $$;

create or replace function public.report_member(p_member_id uuid,p_category text,p_details text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved uuid; connection_id uuid; snapshot jsonb;
begin
 if not public.is_active_member(actor) or actor=p_member_id or not exists(select 1 from public.profiles where id=p_member_id) then raise exception 'Member is unavailable'; end if;
 if p_category not in ('harassment','spam','misrepresentation','privacy','safety','other') then raise exception 'Unsupported report category'; end if;
 if char_length(trim(coalesce(p_details,'')))<10 then raise exception 'Please provide enough detail for review'; end if;
 if exists(select 1 from public.member_reports where reporter_id=actor and target_user_id=p_member_id and status in ('open','reviewing')) then raise exception 'You already have an active report for this member'; end if;
 if (select count(*) from public.member_reports where reporter_id=actor and created_at>now()-interval '24 hours')>=10 then raise exception 'Daily report limit reached'; end if;
 select id into connection_id from public.connections where user_low=least(actor,p_member_id) and user_high=greatest(actor,p_member_id);
 select jsonb_build_object('display_name',display_name,'job_title',job_title,'company',company,'bio',bio,'access_status',access_status,'captured_at',now()) into snapshot from public.profiles where id=p_member_id;
 insert into public.member_reports(reporter_id,target_user_id,connection_id,category,details,evidence_snapshot) values(actor,p_member_id,connection_id,p_category,trim(p_details),snapshot) returning id into saved;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'member.reported','member_report',saved,jsonb_build_object('target_user_id',p_member_id,'category',p_category)); return saved;
end; $$;

create or replace function public.list_member_reports()
returns table(report_id uuid,reporter_id uuid,reporter_name text,reporter_email text,target_user_id uuid,target_name text,target_email text,category text,details text,status text,evidence_snapshot jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_admin(array['super_admin','moderator']::public.app_role[]) then raise exception 'Moderator role required'; end if;
 return query select r.id,r.reporter_id,rp.display_name,ru.email::text,r.target_user_id,tp.display_name,tu.email::text,r.category,r.details,r.status,r.evidence_snapshot,r.created_at from public.member_reports r join auth.users ru on ru.id=r.reporter_id join auth.users tu on tu.id=r.target_user_id left join public.profiles rp on rp.id=r.reporter_id left join public.profiles tp on tp.id=r.target_user_id order by case r.status when 'open' then 0 when 'reviewing' then 1 else 2 end,r.created_at;
end; $$;

create or replace function public.review_member_report(p_report_id uuid,p_action text,p_outcome text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); new_status text;
begin
 if not public.is_admin(array['super_admin','moderator']::public.app_role[]) then raise exception 'Moderator role required'; end if;
 if p_action not in ('start_review','resolve','dismiss') then raise exception 'Unsupported report action'; end if;
 if p_action in ('resolve','dismiss') and char_length(trim(coalesce(p_outcome,'')))<5 then raise exception 'Record a clear outcome'; end if;
 new_status:=case p_action when 'start_review' then 'reviewing' when 'resolve' then 'resolved' else 'dismissed' end;
 update public.member_reports set status=new_status,assigned_to=actor,outcome=case when p_action='start_review' then outcome else trim(p_outcome) end,reviewed_at=case when p_action='start_review' then reviewed_at else now() end,updated_at=now() where id=p_report_id and status not in ('resolved','dismissed');
 if not found then raise exception 'Open report not found'; end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'moderation.report_'||p_action,'member_report',p_report_id,jsonb_build_object('outcome',nullif(trim(p_outcome),'')));
end; $$;

create or replace function public.request_connection(p_member_id uuid,p_connection_code text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();target uuid:=p_member_id;low_id uuid;high_id uuid;saved uuid;existing_status text;
begin
 if not public.is_active_member(actor) then raise exception 'Active visible membership required'; end if;
 if (select count(*) from public.connections where requester_id=actor and created_at>now()-interval '24 hours')>=30 then raise exception 'Daily connection request limit reached'; end if;
 if target is null and nullif(trim(p_connection_code),'') is not null then select user_id into target from public.member_connection_codes where code=upper(trim(p_connection_code)); end if;
 if target is null or target=actor or not public.is_active_member(target) or public.is_blocked_pair(actor,target) then raise exception 'Member is unavailable'; end if;
 low_id:=least(actor,target);high_id:=greatest(actor,target);select status into existing_status from public.connections where user_low=low_id and user_high=high_id;
 if existing_status in ('pending','accepted') then raise exception 'A connection already exists with this member'; end if;
 insert into public.connections(user_low,user_high,requester_id,recipient_id,status) values(low_id,high_id,actor,target,'pending') on conflict(user_low,user_high) do update set requester_id=excluded.requester_id,recipient_id=excluded.recipient_id,status='pending',responded_at=null,updated_at=now() where connections.status in ('ignored','cancelled') returning id into saved;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'connection.requested','connection',saved,jsonb_build_object('recipient_id',target));return saved;
end; $$;

create or replace function public.list_member_directory(p_search text default null,p_city text default null,p_goal text default null,p_limit integer default 24,p_offset integer default 0)
returns table(user_id uuid,display_name text,avatar_url text,job_title text,company text,industry text,country text,city text,bio text,business_name text,website_url text,languages text[],interests text[],goals text[],connection_status text)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_active_member(auth.uid()) then raise exception 'Active visible membership required'; end if;
 return query select p.id,p.display_name,p.avatar_url,p.job_title,p.company,p.industry,p.country,p.city,p.bio,p.business_name,p.website_url,p.languages,coalesce((select array_agg(i.interest order by i.interest) from public.profile_interests i where i.user_id=p.id),array[]::text[]),coalesce((select array_agg(g.goal_key order by g.goal_key) from public.member_goals g where g.user_id=p.id),array[]::text[]),c.status from public.profiles p left join public.connections c on c.user_low=least(auth.uid(),p.id) and c.user_high=greatest(auth.uid(),p.id) where p.id<>auth.uid() and p.access_status='active' and not p.visibility_paused and not public.is_blocked_pair(auth.uid(),p.id) and (nullif(trim(p_search),'') is null or concat_ws(' ',p.display_name,p.job_title,p.company,p.industry,p.business_name) ilike '%'||trim(p_search)||'%') and (nullif(trim(p_city),'') is null or lower(p.city)=lower(trim(p_city))) and (nullif(trim(p_goal),'') is null or exists(select 1 from public.member_goals g where g.user_id=p.id and g.goal_key=p_goal)) order by p.display_name nulls last,p.created_at limit least(greatest(coalesce(p_limit,24),1),50) offset greatest(coalesce(p_offset,0),0);
end; $$;

create or replace function public.list_my_network()
returns table(connection_id uuid,other_user_id uuid,display_name text,avatar_url text,job_title text,company text,city text,country text,status text,direction text,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_active_member(auth.uid()) then raise exception 'Active visible membership required'; end if;
 return query select c.id,p.id,p.display_name,p.avatar_url,p.job_title,p.company,p.city,p.country,c.status,case when c.requester_id=auth.uid() then 'outgoing' else 'incoming' end,c.updated_at from public.connections c join public.profiles p on p.id=case when c.user_low=auth.uid() then c.user_high else c.user_low end where auth.uid() in (c.user_low,c.user_high) and c.status in ('pending','accepted') and p.access_status='active' and not p.visibility_paused and not public.is_blocked_pair(auth.uid(),p.id) order by c.updated_at desc;
end; $$;

create or replace function public.get_connection_contact(p_member_id uuid)
returns table(phone text,whatsapp_number text,linkedin_url text,instagram_url text)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_active_member(auth.uid()) or not public.is_active_member(p_member_id) or public.is_blocked_pair(auth.uid(),p_member_id) then raise exception 'Member is unavailable'; end if;
 if not exists(select 1 from public.connections where user_low=least(auth.uid(),p_member_id) and user_high=greatest(auth.uid(),p_member_id) and status='accepted') then raise exception 'Accepted connection required'; end if;
 return query select case when pp.share_phone_with_connections then pp.phone else null end,case when pp.share_phone_with_connections then pp.whatsapp_number else null end,pp.linkedin_url,pp.instagram_url from public.profile_private pp where pp.user_id=p_member_id;
end; $$;

revoke all on function public.is_blocked_pair(uuid,uuid) from public;grant execute on function public.is_blocked_pair(uuid,uuid) to authenticated;
revoke all on function public.remove_connection(uuid) from public;grant execute on function public.remove_connection(uuid) to authenticated;
revoke all on function public.block_member(uuid,text) from public;grant execute on function public.block_member(uuid,text) to authenticated;
revoke all on function public.unblock_member(uuid) from public;grant execute on function public.unblock_member(uuid) to authenticated;
revoke all on function public.list_my_blocks() from public;grant execute on function public.list_my_blocks() to authenticated;
revoke all on function public.report_member(uuid,text,text) from public;grant execute on function public.report_member(uuid,text,text) to authenticated;
revoke all on function public.list_member_reports() from public;grant execute on function public.list_member_reports() to authenticated;
revoke all on function public.review_member_report(uuid,text,text) from public;grant execute on function public.review_member_report(uuid,text,text) to authenticated;
