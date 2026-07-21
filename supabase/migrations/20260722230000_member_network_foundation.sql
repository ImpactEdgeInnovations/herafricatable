create table public.member_connection_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'), created_at timestamptz not null default now(), rotated_at timestamptz
);
create table public.connections (
  id uuid primary key default gen_random_uuid(), user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade, requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','ignored','cancelled')),
  responded_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint connection_distinct_members check(user_low<>user_high and requester_id<>recipient_id),
  constraint connection_canonical_pair check(user_low<user_high), unique(user_low,user_high)
);
create index connections_requester_status_idx on public.connections(requester_id,status,updated_at desc);
create index connections_recipient_status_idx on public.connections(recipient_id,status,updated_at desc);
alter table public.member_connection_codes enable row level security; alter table public.connections enable row level security;
create policy "Members read own connection code" on public.member_connection_codes for select to authenticated using(user_id=auth.uid());
create policy "Members read own connections" on public.connections for select to authenticated using(auth.uid() in (user_low,user_high));

create or replace function public.is_active_member(check_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=check_user_id and access_status='active' and not visibility_paused);
$$;

create or replace function public.ensure_connection_code()
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved text; candidate text;
begin
  if not public.is_active_member(actor) then raise exception 'Active visible membership required'; end if;
  select code into saved from public.member_connection_codes where user_id=actor;
  if saved is not null then return saved; end if;
  loop candidate:=upper(substr(encode(gen_random_bytes(8),'hex'),1,8)); begin insert into public.member_connection_codes(user_id,code) values(actor,candidate) returning code into saved; exit; exception when unique_violation then end; end loop;
  return saved;
end; $$;

create or replace function public.list_member_directory(p_search text default null,p_city text default null,p_goal text default null,p_limit integer default 24,p_offset integer default 0)
returns table(user_id uuid,display_name text,avatar_url text,job_title text,company text,industry text,country text,city text,bio text,business_name text,website_url text,languages text[],interests text[],goals text[],connection_status text)
language plpgsql stable security definer set search_path='' as $$ begin
  if not public.is_active_member(auth.uid()) then raise exception 'Active visible membership required'; end if;
  return query select p.id,p.display_name,p.avatar_url,p.job_title,p.company,p.industry,p.country,p.city,p.bio,p.business_name,p.website_url,p.languages,
    coalesce((select array_agg(i.interest order by i.interest) from public.profile_interests i where i.user_id=p.id),array[]::text[]),
    coalesce((select array_agg(g.goal_key order by g.goal_key) from public.member_goals g where g.user_id=p.id),array[]::text[]),c.status
  from public.profiles p left join public.connections c on c.user_low=least(auth.uid(),p.id) and c.user_high=greatest(auth.uid(),p.id)
  where p.id<>auth.uid() and p.access_status='active' and not p.visibility_paused
    and (nullif(trim(p_search),'') is null or concat_ws(' ',p.display_name,p.job_title,p.company,p.industry,p.business_name) ilike '%'||trim(p_search)||'%')
    and (nullif(trim(p_city),'') is null or lower(p.city)=lower(trim(p_city)))
    and (nullif(trim(p_goal),'') is null or exists(select 1 from public.member_goals g where g.user_id=p.id and g.goal_key=p_goal))
  order by p.display_name nulls last,p.created_at limit least(greatest(coalesce(p_limit,24),1),50) offset greatest(coalesce(p_offset,0),0);
end; $$;

create or replace function public.request_connection(p_member_id uuid,p_connection_code text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid:=p_member_id; low_id uuid; high_id uuid; saved uuid; existing_status text;
begin
  if not public.is_active_member(actor) then raise exception 'Active visible membership required'; end if;
  if target is null and nullif(trim(p_connection_code),'') is not null then select user_id into target from public.member_connection_codes where code=upper(trim(p_connection_code)); end if;
  if target is null or target=actor or not public.is_active_member(target) then raise exception 'Member is unavailable'; end if;
  low_id:=least(actor,target);high_id:=greatest(actor,target);
  select status into existing_status from public.connections where user_low=low_id and user_high=high_id;
  if existing_status in ('pending','accepted') then raise exception 'A connection already exists with this member'; end if;
  insert into public.connections(user_low,user_high,requester_id,recipient_id,status)
  values(low_id,high_id,actor,target,'pending')
  on conflict(user_low,user_high) do update set requester_id=excluded.requester_id,recipient_id=excluded.recipient_id,status='pending',responded_at=null,updated_at=now()
  where connections.status in ('ignored','cancelled') returning id into saved;
  if saved is null then select id into saved from public.connections where user_low=low_id and user_high=high_id; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'connection.requested','connection',saved,jsonb_build_object('recipient_id',target)); return saved;
end; $$;

create or replace function public.respond_to_connection(p_connection_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.connections%rowtype;
begin
  select * into target from public.connections where id=p_connection_id and recipient_id=actor and status='pending' for update;
  if not found or not public.is_active_member(actor) then raise exception 'Pending request not found'; end if;
  if p_action not in ('accept','ignore') then raise exception 'Unsupported connection action'; end if;
  update public.connections set status=case when p_action='accept' then 'accepted' else 'ignored' end,responded_at=now(),updated_at=now() where id=target.id;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'connection.'||p_action,'connection',target.id,jsonb_build_object('requester_id',target.requester_id));
end; $$;

create or replace function public.list_my_network()
returns table(connection_id uuid,other_user_id uuid,display_name text,avatar_url text,job_title text,company text,city text,country text,status text,direction text,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
  if not public.is_active_member(auth.uid()) then raise exception 'Active visible membership required'; end if;
  return query select c.id,p.id,p.display_name,p.avatar_url,p.job_title,p.company,p.city,p.country,c.status,
    case when c.requester_id=auth.uid() then 'outgoing' else 'incoming' end,c.updated_at
  from public.connections c join public.profiles p on p.id=case when c.user_low=auth.uid() then c.user_high else c.user_low end
  where auth.uid() in (c.user_low,c.user_high) and c.status in ('pending','accepted')
    and p.access_status='active' and not p.visibility_paused order by c.updated_at desc;
end; $$;

create or replace function public.get_connection_contact(p_member_id uuid)
returns table(phone text,whatsapp_number text,linkedin_url text,instagram_url text)
language plpgsql stable security definer set search_path='' as $$ begin
  if not public.is_active_member(auth.uid()) then raise exception 'Active visible membership required'; end if;
  if not public.is_active_member(p_member_id) then raise exception 'Member is unavailable'; end if;
  if not exists(select 1 from public.connections where user_low=least(auth.uid(),p_member_id) and user_high=greatest(auth.uid(),p_member_id) and status='accepted') then raise exception 'Accepted connection required'; end if;
  return query select case when pp.share_phone_with_connections then pp.phone else null end,case when pp.share_phone_with_connections then pp.whatsapp_number else null end,pp.linkedin_url,pp.instagram_url from public.profile_private pp where pp.user_id=p_member_id;
end; $$;

revoke all on function public.is_active_member(uuid) from public; grant execute on function public.is_active_member(uuid) to authenticated;
revoke all on function public.ensure_connection_code() from public; grant execute on function public.ensure_connection_code() to authenticated;
revoke all on function public.list_member_directory(text,text,text,integer,integer) from public; grant execute on function public.list_member_directory(text,text,text,integer,integer) to authenticated;
revoke all on function public.request_connection(uuid,text) from public; grant execute on function public.request_connection(uuid,text) to authenticated;
revoke all on function public.respond_to_connection(uuid,text) from public; grant execute on function public.respond_to_connection(uuid,text) to authenticated;
revoke all on function public.list_my_network() from public; grant execute on function public.list_my_network() to authenticated;
revoke all on function public.get_connection_contact(uuid) from public; grant execute on function public.get_connection_contact(uuid) to authenticated;
