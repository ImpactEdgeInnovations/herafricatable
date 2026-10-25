begin;

-- In-person networking only. No messages, contact details, payments or membership
-- grants are created here. Private tables are accessed only through scoped RPCs.
create schema if not exists hat_networking;
revoke all on schema hat_networking from public, anon, authenticated;

create table hat_networking.sessions (
  event_id uuid primary key references public.events(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  minutes integer not null check (minutes between 2 and 15),
  changeover integer not null check (changeover between 30 and 180),
  points text[] not null check (cardinality(points) between 1 and 30),
  prompt text not null default '' check (char_length(prompt) <= 280),
  status text not null default 'scheduled' check (status in ('scheduled','running','paused','finished')),
  disabled boolean not null default false,
  anchor_at timestamptz,
  paused_at timestamptz,
  round_no integer not null default 0,
  round_ends_at timestamptz,
  next_at timestamptz,
  updated_by uuid not null references auth.users(id),
  check (ends_at > starts_at and ends_at - starts_at <= interval '3 hours')
);
create table hat_networking.participants (
  event_id uuid not null references hat_networking.sessions(event_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ready boolean not null default false,
  introduction text not null default '' check (char_length(introduction) <= 280),
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  last_round integer not null default 0,
  conversations integer not null default 0,
  primary key(event_id,user_id)
);
create table hat_networking.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references hat_networking.sessions(event_id) on delete cascade,
  round_no integer not null,
  member_a uuid not null references auth.users(id),
  member_b uuid not null references auth.users(id),
  accepted_a boolean not null default false,
  accepted_b boolean not null default false,
  status text not null default 'offered' check(status in ('offered','active','completed','closed')),
  point text not null,
  accept_by timestamptz not null,
  ends_at timestamptz not null,
  unique(event_id,member_a,member_b),
  check(member_a < member_b)
);
create index networking_matches_round on hat_networking.matches(event_id,round_no,status);
create table hat_networking.help_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references hat_networking.sessions(event_id) on delete cascade,
  user_id uuid not null references auth.users(id),
  note text not null check(char_length(note) between 5 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index networking_help_open on hat_networking.help_requests(event_id,created_at) where resolved_at is null;
create table hat_networking.actions (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id),
  actor_id uuid not null references auth.users(id),
  action text not null,
  created_at timestamptz not null default now()
);
alter table hat_networking.sessions enable row level security;
alter table hat_networking.participants enable row level security;
alter table hat_networking.matches enable row level security;
alter table hat_networking.help_requests enable row level security;
alter table hat_networking.actions enable row level security;
revoke all on all tables in schema hat_networking from public,anon,authenticated;
revoke all on all sequences in schema hat_networking from public,anon,authenticated;

create function hat_networking.manager(e uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (public.can_host_event(e)
    or public.is_admin(array['super_admin']::public.app_role[]));
$$;
create function hat_networking.eligible(e uuid,u uuid, checked boolean default true) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.event_memberships m
    join public.events v on v.id=m.event_id join public.profiles p on p.id=m.user_id
    where m.event_id=e and m.user_id=u and m.status in ('confirmed','attended')
      and ((checked and m.status='attended' and v.status='published' and v.ends_at>now())
        or (not checked and v.status in ('published','completed') and v.ends_at>now()-interval '14 days'))
      and v.format in ('in_person','hybrid')
      and (m.order_id is null or exists(select 1 from public.orders o where o.id=m.order_id and o.status in ('paid','approved','fulfilled')))
      and p.access_status in ('active','pending') and not p.visibility_paused);
$$;

-- Called only while holding the session row lock. Each read advances the same
-- server schedule; no cron, browser clock, or per-pair Admin approval is needed.
create function hat_networking.tick(e uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s hat_networking.sessions; m hat_networking.matches; a uuid; b uuid; point_name text; t timestamptz:=now();
begin
  select * into s from hat_networking.sessions where event_id=e for update;
  if not found then return; end if;
  if t>=s.ends_at or not exists(select 1 from public.events where id=e and status='published' and ends_at>t) then
    update hat_networking.sessions set status='finished' where event_id=e;
    update hat_networking.matches set status=case when status='active' then 'completed' else 'closed' end
      where event_id=e and status in ('offered','active');
    return;
  end if;
  if s.disabled or s.status in ('scheduled','paused','finished') then return; end if;
  update hat_networking.participants set ready=false
    where event_id=e and ready and not hat_networking.eligible(e,user_id);
  for m in select * from hat_networking.matches where event_id=e and status in ('offered','active') loop
    if m.ends_at<=t then
      update hat_networking.matches set status=case when m.status='active' then 'completed' else 'closed' end where id=m.id;
    elsif public.is_blocked_pair(m.member_a,m.member_b)
      or not exists(select 1 from hat_networking.participants where event_id=e and user_id=m.member_a and ready and (m.status='active' or seen_at>t-interval '60 seconds'))
      or not exists(select 1 from hat_networking.participants where event_id=e and user_id=m.member_b and ready and (m.status='active' or seen_at>t-interval '60 seconds'))
      or (m.status='offered' and m.accept_by<=t) then
      update hat_networking.matches set status='closed' where id=m.id;
      -- Only the responding/present partner returns to this round's pool.
      update hat_networking.participants p set last_round=greatest(0,s.round_no-1)
      where p.event_id=e and p.user_id in (m.member_a,m.member_b) and p.ready and p.seen_at>t-interval '60 seconds'
        and (m.status='active' or (p.user_id=m.member_a and m.accepted_a) or (p.user_id=m.member_b and m.accepted_b));
    end if;
  end loop;
  if s.next_at is null or t>=s.next_at then
    s.round_no:=floor(extract(epoch from (t-s.anchor_at))/(s.minutes*60+s.changeover))::integer+1;
    s.round_ends_at:=least(s.anchor_at+make_interval(secs=>(s.round_no-1)*(s.minutes*60+s.changeover)+s.minutes*60),s.ends_at);
    s.next_at:=s.anchor_at+make_interval(secs=>s.round_no*(s.minutes*60+s.changeover));
    update hat_networking.sessions set round_no=s.round_no,round_ends_at=s.round_ends_at,next_at=s.next_at where event_id=e;
  end if;
  -- Leave time to accept and actually speak. Late arrivals join the next round.
  if s.round_ends_at-t<interval '60 seconds' then return; end if;
  for a in select p.user_id from hat_networking.participants p
    where p.event_id=e and p.ready and p.seen_at>t-interval '60 seconds' and p.last_round<s.round_no
    order by p.conversations,p.last_round,p.joined_at,p.user_id loop
    if exists(select 1 from hat_networking.participants where event_id=e and user_id=a and last_round>=s.round_no) then continue; end if;
    select p.user_id into b from hat_networking.participants p
      where p.event_id=e and p.ready and p.seen_at>t-interval '60 seconds' and p.last_round<s.round_no and p.user_id<>a
        and not public.is_blocked_pair(a,p.user_id)
        and not exists(select 1 from hat_networking.matches x where x.event_id=e and x.member_a=least(a,p.user_id) and x.member_b=greatest(a,p.user_id))
      order by p.conversations,p.last_round,p.joined_at,p.user_id limit 1;
    if b is null then continue; end if;
    select value into point_name from unnest(s.points) with ordinality as points(value,ord)
      where not exists(select 1 from hat_networking.matches x where x.event_id=e and x.round_no=s.round_no and x.point=value and x.status in ('offered','active'))
      order by ord limit 1;
    if point_name is null then exit; end if;
    insert into hat_networking.matches(event_id,round_no,member_a,member_b,point,accept_by,ends_at)
      values(e,s.round_no,least(a,b),greatest(a,b),point_name,t+interval '30 seconds',s.round_ends_at);
    update hat_networking.participants set last_round=s.round_no where event_id=e and user_id in (a,b);
  end loop;
end;
$$;

create function public.save_event_networking(p_event_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,
  p_minutes integer,p_changeover integer,p_points text[],p_prompt text default '') returns void
language plpgsql security definer set search_path='' as $$
declare v public.events;
begin
  if not hat_networking.manager(p_event_id) then raise exception 'Event Host or Super Admin required'; end if;
  select * into v from public.events where id=p_event_id for update;
  if v.status<>'published' or v.format not in ('in_person','hybrid') or p_starts_at<v.starts_at or p_ends_at>v.ends_at
     or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_ends_at<=now()
     or p_minutes is null or p_minutes not between 2 and 15 or p_changeover is null or p_changeover not between 30 and 180
     or p_ends_at-p_starts_at<make_interval(mins=>p_minutes) then raise exception 'Choose valid networking times inside this in-person event'; end if;
  if p_points is null or cardinality(p_points) not between 1 and 30
    or exists(select 1 from unnest(p_points) x where x is null or char_length(trim(x)) not between 2 and 60)
    or (select count(distinct trim(x)) from unnest(p_points) x)<>cardinality(p_points) then
    raise exception 'Add 1 to 30 different meeting points, one per line'; end if;
  if exists(select 1 from hat_networking.sessions where event_id=p_event_id and status<>'scheduled') then raise exception 'This session has already started'; end if;
  insert into hat_networking.sessions(event_id,starts_at,ends_at,minutes,changeover,points,prompt,updated_by)
    values(p_event_id,p_starts_at,p_ends_at,p_minutes,p_changeover,array(select trim(x) from unnest(p_points) x),coalesce(trim(p_prompt),''),auth.uid())
    on conflict(event_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,minutes=excluded.minutes,
      changeover=excluded.changeover,points=excluded.points,prompt=excluded.prompt,updated_by=auth.uid();
  insert into hat_networking.actions(event_id,actor_id,action) values(p_event_id,auth.uid(),'schedule');
end;
$$;

create function public.control_event_networking(p_event_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare s hat_networking.sessions; shift interval;
begin
  if not hat_networking.manager(p_event_id) then raise exception 'Event Host or Super Admin required'; end if;
  select * into s from hat_networking.sessions where event_id=p_event_id for update;
  if not found then raise exception 'Save a networking session first'; end if;
  if p_action in ('disable','enable') then
    if not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super Admin required'; end if;
    update hat_networking.sessions set disabled=(p_action='disable') where event_id=p_event_id;
    if p_action='disable' and s.status='running' then
      update hat_networking.sessions set status='paused',paused_at=now() where event_id=p_event_id;
    end if;
  elsif p_action='start' and s.status='scheduled' and not s.disabled then
    if now()<s.starts_at or now()>=s.ends_at or not exists(select 1 from public.events where id=p_event_id and status='published' and starts_at<=now() and ends_at>now()) then
      raise exception 'Start during the scheduled networking time'; end if;
    update hat_networking.sessions set status='running',anchor_at=now(),next_at=null where event_id=p_event_id;
  elsif p_action='pause' and s.status='running' then
    update hat_networking.sessions set status='paused',paused_at=now() where event_id=p_event_id;
  elsif p_action='resume' and s.status='paused' and not s.disabled and now()<s.ends_at then
    shift:=now()-s.paused_at;
    update hat_networking.sessions set status='running',anchor_at=anchor_at+shift,
      next_at=next_at+shift,round_ends_at=least(round_ends_at+shift,ends_at),paused_at=null where event_id=p_event_id;
    update hat_networking.matches set ends_at=least(ends_at+shift,s.ends_at),accept_by=accept_by+shift
      where event_id=p_event_id and status in ('offered','active');
  elsif p_action='finish' then
    update hat_networking.sessions set status='finished' where event_id=p_event_id;
    update hat_networking.matches set status=case when status='active' then 'completed' else 'closed' end
      where event_id=p_event_id and status in ('offered','active');
  else raise exception 'Refresh the session before changing it'; end if;
  insert into hat_networking.actions(event_id,actor_id,action) values(p_event_id,auth.uid(),p_action);
end;
$$;

create function public.join_event_networking(p_event_id uuid,p_join boolean,p_introduction text default '') returns void
language plpgsql security definer set search_path='' as $$
declare s hat_networking.sessions;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into s from hat_networking.sessions where event_id=p_event_id for update;
  if not found then raise exception 'Networking has not been scheduled'; end if;
  if p_join is null then raise exception 'Choose whether to join'; end if;
  if p_join then
    if s.disabled or s.status='finished' or now()>=s.ends_at or not hat_networking.eligible(p_event_id,auth.uid()) then
      raise exception 'You need a valid event place and check-in to join networking'; end if;
    if char_length(trim(coalesce(p_introduction,''))) not between 5 and 280
       or p_introduction ~* '(https?://|www\.|@|[0-9][0-9 ()+.-]{6,}[0-9])' then
      raise exception 'Add a short introduction without links, email addresses or phone numbers'; end if;
    if not exists(select 1 from hat_networking.participants where event_id=p_event_id and user_id=auth.uid())
      and (select count(*) from hat_networking.participants where event_id=p_event_id)>=200 then raise exception 'This networking session is full'; end if;
    insert into hat_networking.participants(event_id,user_id,ready,introduction)
      values(p_event_id,auth.uid(),true,trim(p_introduction)) on conflict(event_id,user_id)
      do update set ready=true,introduction=excluded.introduction,seen_at=now();
  else
    update hat_networking.participants set ready=false where event_id=p_event_id and user_id=auth.uid();
  end if;
  perform hat_networking.tick(p_event_id);
end;
$$;

create function public.answer_event_networking(p_event_id uuid,p_match_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path='' as $$
declare s hat_networking.sessions; m hat_networking.matches;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into s from hat_networking.sessions where event_id=p_event_id for update;
  if s.status<>'running' or s.disabled or now()>=s.ends_at or not hat_networking.eligible(p_event_id,auth.uid()) then raise exception 'Networking is not available'; end if;
  perform hat_networking.tick(p_event_id);
  select * into m from hat_networking.matches where id=p_match_id and event_id=p_event_id and auth.uid() in (member_a,member_b);
  if not found or m.status not in ('offered','active') or m.ends_at<=now() or p_accept is null then raise exception 'This introduction has ended'; end if;
  if p_accept then
    if m.status='active' then return; end if;
    if m.accept_by<=now() then raise exception 'This introduction has ended'; end if;
    update hat_networking.matches set accepted_a=accepted_a or auth.uid()=member_a,accepted_b=accepted_b or auth.uid()=member_b where id=m.id;
    update hat_networking.matches set status='active' where id=m.id and accepted_a and accepted_b;
    if found then update hat_networking.participants set conversations=conversations+1 where event_id=p_event_id and user_id in (m.member_a,m.member_b); end if;
  else
    update hat_networking.matches set status='closed' where id=m.id;
    update hat_networking.participants set last_round=greatest(0,s.round_no-1)
      where event_id=p_event_id and user_id in (m.member_a,m.member_b) and user_id<>auth.uid();
  end if;
end;
$$;

create function public.get_event_networking(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s hat_networking.sessions; m hat_networking.matches; me hat_networking.participants; host boolean; result jsonb; other_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  host:=hat_networking.manager(p_event_id);
  if not host and not hat_networking.eligible(p_event_id,auth.uid(),false) then raise exception 'A valid event place is required'; end if;
  select * into s from hat_networking.sessions where event_id=p_event_id for update;
  if not found then return jsonb_build_object('session',null,'server_now',now(),'can_manage',host); end if;
  if hat_networking.eligible(p_event_id,auth.uid()) then
    update hat_networking.participants set seen_at=now() where event_id=p_event_id and user_id=auth.uid() and ready;
  end if;
  perform hat_networking.tick(p_event_id);
  select * into s from hat_networking.sessions where event_id=p_event_id;
  select * into me from hat_networking.participants where event_id=p_event_id and user_id=auth.uid();
  result:=jsonb_build_object('server_now',now(),'can_manage',host,'is_admin',public.is_admin(array['super_admin']::public.app_role[]),
    'eligible',hat_networking.eligible(p_event_id,auth.uid()),'joined',coalesce(me.ready,false),'introduction',coalesce(me.introduction,''),
    'session',jsonb_build_object('starts_at',s.starts_at,'ends_at',s.ends_at,'minutes',s.minutes,'changeover',s.changeover,
      'status',s.status,'disabled',s.disabled,'round_no',s.round_no,'round_ends_at',s.round_ends_at,'next_at',s.next_at,'prompt',s.prompt,
      'points',case when host then to_jsonb(s.points) else null end));
  if me.ready and hat_networking.eligible(p_event_id,auth.uid()) and s.status='running' and not s.disabled then
    select * into m from hat_networking.matches where event_id=p_event_id and auth.uid() in (member_a,member_b)
      and status in ('offered','active') and ends_at>now() limit 1;
    if found then
      other_id:=case when auth.uid()=m.member_a then m.member_b else m.member_a end;
      result:=result||jsonb_build_object('match',jsonb_build_object('id',m.id,'status',m.status,'point',m.point,'ends_at',m.ends_at,'accept_by',m.accept_by,
        'accepted',case when auth.uid()=m.member_a then m.accepted_a else m.accepted_b end,
        'person',(select jsonb_build_object('name',split_part(coalesce(nullif(trim(p.display_name),''),'Guest'),' ',1),'avatar_url',p.avatar_url,'introduction',a.introduction)
          from public.profiles p join hat_networking.participants a on a.user_id=p.id and a.event_id=p_event_id where p.id=other_id)));
    end if;
  end if;
  -- Completed mutual introductions only; existing connection rules remain authoritative.
  result:=result||jsonb_build_object('met',coalesce((select jsonb_agg(jsonb_build_object('match_id',x.id,'name',split_part(p.display_name,' ',1)))
    from hat_networking.matches x join public.profiles p on p.id=case when x.member_a=auth.uid() then x.member_b else x.member_a end
    where x.event_id=p_event_id and auth.uid() in (x.member_a,x.member_b) and x.status='completed'
      and not public.is_blocked_pair(x.member_a,x.member_b)), '[]'::jsonb));
  if host then
    result:=result||jsonb_build_object('people',coalesce((select jsonb_agg(jsonb_build_object('name',p.display_name,'ready',a.ready and a.seen_at>now()-interval '60 seconds',
      'paired',exists(select 1 from hat_networking.matches x where x.event_id=p_event_id and a.user_id in (x.member_a,x.member_b) and x.status in ('offered','active'))))
      from hat_networking.participants a join public.profiles p on p.id=a.user_id where a.event_id=p_event_id),'[]'::jsonb),
      'help',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',p.display_name,'note',r.note,'created_at',r.created_at)) from hat_networking.help_requests r
        join public.profiles p on p.id=r.user_id where r.event_id=p_event_id and r.resolved_at is null),'[]'::jsonb));
  end if;
  return result;
end;
$$;

create function public.event_networking_help(p_event_id uuid,p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not hat_networking.eligible(p_event_id,auth.uid(),false) then raise exception 'A valid event place is required'; end if;
  if char_length(trim(coalesce(p_note,''))) not between 5 and 500 then raise exception 'Tell the Host what help you need'; end if;
  if exists(select 1 from hat_networking.help_requests where event_id=p_event_id and user_id=auth.uid() and (resolved_at is null or created_at>now()-interval '1 minute')) then raise exception 'Your request was sent. Please speak to the event team if urgent'; end if;
  insert into hat_networking.help_requests(event_id,user_id,note) values(p_event_id,auth.uid(),trim(p_note));
end;
$$;
create function public.resolve_event_networking_help(p_event_id uuid,p_help_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not hat_networking.manager(p_event_id) then raise exception 'Event Host or Super Admin required'; end if;
  update hat_networking.help_requests set resolved_at=now() where id=p_help_id and event_id=p_event_id;
end;
$$;
create function public.connect_event_networking(p_event_id uuid,p_match_id uuid,p_note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare other_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select case when member_a=auth.uid() then member_b else member_a end into other_id
    from hat_networking.matches where id=p_match_id and event_id=p_event_id and auth.uid() in (member_a,member_b) and status='completed';
  if other_id is null then raise exception 'Complete a mutual introduction first'; end if;
  return public.request_connection_with_context(other_id,null,coalesce(p_note,''));
end;
$$;

revoke all on all functions in schema hat_networking from public,anon,authenticated;
revoke all on function public.save_event_networking(uuid,timestamptz,timestamptz,integer,integer,text[],text),
  public.control_event_networking(uuid,text),public.join_event_networking(uuid,boolean,text),public.answer_event_networking(uuid,uuid,boolean),
  public.get_event_networking(uuid),public.event_networking_help(uuid,text),public.resolve_event_networking_help(uuid,uuid),
  public.connect_event_networking(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_event_networking(uuid,timestamptz,timestamptz,integer,integer,text[],text),
  public.control_event_networking(uuid,text),public.join_event_networking(uuid,boolean,text),public.answer_event_networking(uuid,uuid,boolean),
  public.get_event_networking(uuid),public.event_networking_help(uuid,text),public.resolve_event_networking_help(uuid,uuid),
  public.connect_event_networking(uuid,uuid,text) to authenticated;
commit;
