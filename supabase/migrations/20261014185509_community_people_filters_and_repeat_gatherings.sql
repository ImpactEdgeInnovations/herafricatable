begin;

-- Version aligned with the applied live migration history.

create or replace function public.search_community_people(
 p_community_id uuid,p_query text default '',p_industry text default '',p_city text default '',p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.communities_enabled() or not public.is_active_member(auth.uid()) or not exists(
  select 1 from public.community_memberships where community_id=p_community_id and user_id=auth.uid() and status='active'
 ) then raise exception 'Active community membership required';end if;
 if char_length(coalesce(p_query,''))>120 or char_length(coalesce(p_industry,''))>180 or char_length(coalesce(p_city,''))>120
  or p_offset is null or p_offset<0 or p_offset>10000 then raise exception 'Choose valid member filters';end if;
 with permitted as materialized (
  select p.id as user_id,p.display_name,p.avatar_url,p.job_title,p.company,p.city,p.country,p.industry,m.role as membership_role,
   case m.role when 'owner' then 0 when 'moderator' then 1 else 2 end as rank
  from public.community_memberships m join public.profiles p on p.id=m.user_id
  where m.community_id=p_community_id and m.status='active' and p.access_status='active'
   and not p.visibility_paused and not public.is_blocked_pair(auth.uid(),p.id)
 ), filtered as (
  select * from permitted where (nullif(btrim(p_query),'') is null or strpos(lower(concat_ws(' ',display_name,job_title,company,industry,city)),lower(btrim(p_query)))>0)
   and (nullif(p_industry,'') is null or industry=p_industry) and (nullif(p_city,'') is null or city=p_city)
 ), page as (select * from filtered order by rank,display_name,user_id limit 17 offset p_offset)
 select jsonb_build_object(
  'members',coalesce((select jsonb_agg(to_jsonb(x)-'rank' order by rank,display_name,user_id) from (select * from page order by rank,display_name,user_id limit 16)x),'[]'::jsonb),
  'has_more',(select count(*)>16 from page),
  'industries',coalesce((select jsonb_agg(industry order by industry) from(select distinct industry from permitted where nullif(btrim(industry),'') is not null order by industry limit 200)x),'[]'::jsonb),
  'cities',coalesce((select jsonb_agg(city order by city) from(select distinct city from permitted where nullif(btrim(city),'') is not null order by city limit 200)x),'[]'::jsonb)
 ) into result;
 return result;
end;$$;
revoke all on function public.search_community_people(uuid,text,text,text,integer) from public,anon;
grant execute on function public.search_community_people(uuid,text,text,text,integer) to authenticated;

create table public.event_repeat_plans(
 id uuid primary key default gen_random_uuid(),
 source_event_id uuid not null references public.events(id) on delete cascade,
 community_id uuid references public.communities(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 frequency text not null check(frequency in('daily','weekly','monthly')),
 first_starts_at timestamptz not null,
 proposal_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(),
 unique(created_by,request_id)
);
create unique index event_repeat_plans_source_owner on public.event_repeat_plans(source_event_id,created_by,(coalesce(community_id,'00000000-0000-0000-0000-000000000000'::uuid)));
create index event_repeat_plans_community_idx on public.event_repeat_plans(community_id) where community_id is not null;
alter table public.event_repeat_plans enable row level security;
revoke all on public.event_repeat_plans from public,anon,authenticated;
grant select on public.event_repeat_plans to authenticated;
create policy "Hosts read their repeat plans" on public.event_repeat_plans for select to authenticated
 using(created_by=auth.uid() and public.is_active_member(auth.uid()) and (community_id is null or public.can_manage_community(community_id)));

create or replace function public.plan_repeat_events(p_event_id uuid,p_community_id uuid,p_frequency text,p_count integer,p_first_starts_at timestamptz,p_request_id uuid)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); e public.events; c public.community_event_proposals; m public.member_event_proposals;
 existing public.event_repeat_plans; step interval; occurrence timestamptz; finish timestamptz; saved uuid; ids uuid[]:='{}';i integer;
begin
 if actor is null or not public.is_active_member(actor) then raise exception 'Active membership required';end if;
 if p_frequency is null or p_frequency not in('daily','weekly','monthly') or p_count is null or p_count not between 2 and 12
  or p_request_id is null or p_first_starts_at is null or p_first_starts_at<=now() then raise exception 'Choose a future date and between 2 and 12 repeats';end if;
 select * into e from public.events where id=p_event_id for update;
 if not found or e.status not in('published','completed') then raise exception 'Open an existing event before planning repeat dates';end if;
 if p_community_id is not null then
  if not public.can_manage_community(p_community_id) or not exists(select 1 from public.communities where id=p_community_id and status='published') then raise exception 'Community Host access required';end if;
  select * into c from public.community_event_proposals where canonical_event_id=e.id and community_id=p_community_id and status='approved';
  if not found or c.pricing_mode<>'free' or c.visibility<>'community_only' then raise exception 'Choose a free gathering created in this Community';end if;
 else
  if not exists(select 1 from public.event_hosts where event_id=e.id and user_id=actor and status='active') then raise exception 'Current Event Host access required';end if;
  select * into m from public.member_event_proposals where canonical_event_id=e.id and proposed_by=actor and status='approved';
  if not found or e.audience<>'public' or m.pricing_mode<>'free' or m.price_minor<>0 then raise exception 'Only the original creator can repeat this free public event';end if;
 end if;
 select * into existing from public.event_repeat_plans where source_event_id=e.id and created_by=actor and community_id is not distinct from p_community_id;
 if found then
  if existing.request_id<>p_request_id then raise exception 'This event already has a repeat schedule. Open its saved dates';end if;
  if existing.frequency<>p_frequency or existing.first_starts_at<>p_first_starts_at or cardinality(existing.proposal_ids)<>p_count then raise exception 'The saved repeat schedule differs from these dates';end if;
  return existing.proposal_ids;
 end if;
 step:=case p_frequency when 'daily' then interval '1 day' when 'weekly' then interval '7 days' else interval '1 month' end;
 if e.ends_at-e.starts_at>step then raise exception 'Choose a repeat interval longer than the event';end if;
 for i in 0..p_count-1 loop
  occurrence:=((p_first_starts_at at time zone e.timezone)+i*step) at time zone e.timezone;
  finish:=occurrence+(e.ends_at-e.starts_at);
  if p_community_id is not null then
   insert into public.community_event_proposals(community_id,proposed_by,title,summary,format,starts_at,ends_at,timezone,venue_name,city,country,address_line,map_url,online_url,capacity,safety_contact_name,safety_contact_phone,accessibility_notes,host_note,status)
   values(c.community_id,actor,c.title,c.summary,c.format,occurrence,finish,e.timezone,c.venue_name,c.city,c.country,c.address_line,c.map_url,c.online_url,c.capacity,c.safety_contact_name,c.safety_contact_phone,c.accessibility_notes,c.host_note,'draft') returning id into saved;
  else
   insert into public.member_event_proposals(proposed_by,title,summary,format,starts_at,ends_at,timezone,venue_name,city,country,address_line,map_url,online_url,capacity,safety_contact_name,safety_contact_phone,accessibility_notes,host_experience,host_note,community_after_event,status)
   values(actor,m.title,m.summary,m.format,occurrence,finish,e.timezone,m.venue_name,m.city,m.country,m.address_line,m.map_url,m.online_url,m.capacity,m.safety_contact_name,m.safety_contact_phone,m.accessibility_notes,m.host_experience,m.host_note,false,'draft') returning id into saved;
  end if;
  ids:=array_append(ids,saved);
 end loop;
 insert into public.event_repeat_plans(source_event_id,community_id,created_by,request_id,frequency,first_starts_at,proposal_ids)
 values(e.id,p_community_id,actor,p_request_id,p_frequency,p_first_starts_at,ids);
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'event.repeat_dates_planned','event',e.id,jsonb_build_object('frequency',p_frequency,'count',p_count,'community_id',p_community_id));
 return ids;
end;$$;
revoke all on function public.plan_repeat_events(uuid,uuid,text,integer,timestamptz,uuid) from public,anon;
grant execute on function public.plan_repeat_events(uuid,uuid,text,integer,timestamptz,uuid) to authenticated;

commit;
