begin;
-- Applied with Management API history version 20261026063649.

-- Private acknowledgement, not an email/push or a disclosure of who ended it.
-- Existing deny-all RLS and schema/table grants remain unchanged.
alter table hat_networking.participants
  add column ended_match_id uuid references hat_networking.matches(id) on delete set null,
  add column ended_at timestamptz,
  add column ended_conversation boolean not null default false;

create function hat_networking.note_ended_introduction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.status in ('offered','active') and new.status='closed' and old.ends_at>now() then
    update hat_networking.participants set ready=false,ended_match_id=new.id,
      ended_at=now(),ended_conversation=(old.status='active'),last_round=greatest(0,new.round_no-1)
      where event_id=new.event_id and user_id in (new.member_a,new.member_b) and ready;
  end if;
  return new;
end;
$$;
revoke all on function hat_networking.note_ended_introduction() from public,anon,authenticated;
create trigger networking_private_end_notice after update of status on hat_networking.matches
  for each row execute function hat_networking.note_ended_introduction();

create or replace function public.join_event_networking(p_event_id uuid,p_join boolean,p_introduction text default '') returns void
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
    if exists(select 1 from hat_networking.participants where event_id=p_event_id and user_id=auth.uid() and ended_match_id is not null) then
      raise exception 'Refresh networking and choose whether to continue'; end if;
    if char_length(trim(coalesce(p_introduction,''))) not between 5 and 280
       or p_introduction ~* '(https?://|www\.|@|[0-9][0-9 ()+.-]{6,}[0-9])' then
      raise exception 'Add a short introduction without links, email addresses or phone numbers'; end if;
    if not exists(select 1 from hat_networking.participants where event_id=p_event_id and user_id=auth.uid())
      and (select count(*) from hat_networking.participants where event_id=p_event_id)>=200 then raise exception 'This networking session is full'; end if;
    insert into hat_networking.participants(event_id,user_id,ready,introduction)
      values(p_event_id,auth.uid(),true,trim(p_introduction)) on conflict(event_id,user_id)
      do update set ready=true,introduction=excluded.introduction,seen_at=now();
  else
    update hat_networking.participants set ready=false,ended_match_id=null,ended_at=null,ended_conversation=false
      where event_id=p_event_id and user_id=auth.uid();
  end if;
  perform hat_networking.tick(p_event_id);
end;
$$;

create function public.continue_event_networking(p_event_id uuid,p_notice_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s hat_networking.sessions;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into s from hat_networking.sessions where event_id=p_event_id for update;
  if not found or s.status<>'running' or s.disabled or now()>=s.ends_at
    or not hat_networking.eligible(p_event_id,auth.uid()) then raise exception 'Networking is not available'; end if;
  -- Scope to this member and the notice she actually saw. Stale tabs cannot
  -- acknowledge a later interruption or disturb a newer match.
  update hat_networking.participants set ready=true,seen_at=now(),ended_match_id=null,ended_at=null,ended_conversation=false
    where event_id=p_event_id and user_id=auth.uid() and ended_match_id=p_notice_id;
  if not found then raise exception 'Refresh networking and choose whether to continue'; end if;
  perform hat_networking.tick(p_event_id);
end;
$$;
revoke all on function public.continue_event_networking(uuid,uuid) from public,anon,authenticated;
grant execute on function public.continue_event_networking(uuid,uuid) to authenticated;

create or replace function public.get_event_networking(p_event_id uuid) returns jsonb
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
  if me.ended_match_id is not null then
    result:=result||jsonb_build_object('end_notice',jsonb_build_object('id',me.ended_match_id,'at',me.ended_at,'conversation',me.ended_conversation));
  end if;
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
  result:=result||jsonb_build_object('met',coalesce((select jsonb_agg(jsonb_build_object('match_id',x.id,'name',split_part(p.display_name,' ',1)))
    from hat_networking.matches x join public.profiles p on p.id=case when x.member_a=auth.uid() then x.member_b else x.member_a end
    where x.event_id=p_event_id and auth.uid() in (x.member_a,x.member_b) and x.status='completed'
      and not public.is_blocked_pair(x.member_a,x.member_b)), '[]'::jsonb));
  if host then
    result:=result||jsonb_build_object('people',coalesce((select jsonb_agg(jsonb_build_object('name',p.display_name,'ready',a.ready and a.seen_at>now()-interval '60 seconds',
      'choosing',a.ended_match_id is not null,
      'paired',exists(select 1 from hat_networking.matches x where x.event_id=p_event_id and a.user_id in (x.member_a,x.member_b) and x.status in ('offered','active'))))
      from hat_networking.participants a join public.profiles p on p.id=a.user_id where a.event_id=p_event_id),'[]'::jsonb),
      'help',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',p.display_name,'note',r.note,'created_at',r.created_at)) from hat_networking.help_requests r
        join public.profiles p on p.id=r.user_id where r.event_id=p_event_id and r.resolved_at is null),'[]'::jsonb));
  end if;
  return result;
end;
$$;
commit;
