begin;
-- Applied history version: 20261102154259.

-- A connection opportunity follows a mutually accepted conversation, never an
-- offer that was skipped. Ending early must not erase a real conversation.
alter table hat_networking.matches add column ended_at timestamptz;
update hat_networking.matches x set ended_at=coalesce(
  (select min(p.ended_at) from hat_networking.participants p where p.ended_match_id=x.id),least(x.ends_at,now()))
  where x.status in ('completed','closed');
create function hat_networking.stamp_conversation_end() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status in ('completed','closed') and old.status in ('offered','active') then new.ended_at:=now(); end if;
  return new;
end; $$;
revoke all on function hat_networking.stamp_conversation_end() from public,anon,authenticated;
create trigger networking_stamp_end before update of status on hat_networking.matches
  for each row execute function hat_networking.stamp_conversation_end();

create table hat_networking.followthrough_choices (
  match_id uuid not null references hat_networking.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deferred_at timestamptz not null default now(),
  primary key(match_id,user_id)
);
alter table hat_networking.followthrough_choices enable row level security;
revoke all on hat_networking.followthrough_choices from public,anon,authenticated;

create function public.get_my_networking_followthrough(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not hat_networking.eligible(p_event_id,auth.uid(),false) then raise exception 'A valid event place is required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) order by v.ended_at desc,v.match_id) from (
    select x.id as match_id,split_part(coalesce(nullif(trim(p.display_name),''),'Guest'),' ',1) as name,
      p.avatar_url,x.ended_at,choice.deferred_at is not null as deferred,
      case when c.status='accepted' then 'connected'
        when c.status='pending' and c.requester_id=auth.uid() then 'outgoing'
        when c.status='pending' then 'incoming'
        when public.is_active_member(auth.uid()) and public.is_active_member(p.id) then 'available'
        else 'unavailable' end as connection_state
    from hat_networking.matches x
    join public.profiles p on p.id=case when x.member_a=auth.uid() then x.member_b else x.member_a end
    left join public.connections c on c.user_low=least(auth.uid(),p.id) and c.user_high=greatest(auth.uid(),p.id)
    left join hat_networking.followthrough_choices choice on choice.match_id=x.id and choice.user_id=auth.uid()
    where x.event_id=p_event_id and auth.uid() in (x.member_a,x.member_b)
      and x.status in ('completed','closed') and x.accepted_a and x.accepted_b
      and p.access_status='active' and not p.visibility_paused and not public.is_blocked_pair(x.member_a,x.member_b)
    order by x.ended_at desc,x.id limit 200
  ) v),'[]'::jsonb);
end; $$;

create function public.defer_networking_connection(p_event_id uuid,p_match_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not hat_networking.eligible(p_event_id,auth.uid(),false) then raise exception 'A valid event place is required'; end if;
  if not exists(select 1 from hat_networking.matches x where x.event_id=p_event_id and x.id=p_match_id
    and auth.uid() in (x.member_a,x.member_b) and x.status in ('completed','closed') and x.accepted_a and x.accepted_b
    and not public.is_blocked_pair(x.member_a,x.member_b)) then raise exception 'A mutual conversation is required'; end if;
  insert into hat_networking.followthrough_choices(match_id,user_id) values(p_match_id,auth.uid())
    on conflict(match_id,user_id) do nothing;
  -- No notification, audit of personal preference, or partner-visible state.
end; $$;

create or replace function public.connect_event_networking(p_event_id uuid,p_match_id uuid,p_note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare other_id uuid;
begin
  if auth.uid() is null or not hat_networking.eligible(p_event_id,auth.uid(),false) then raise exception 'A valid event place is required'; end if;
  select case when member_a=auth.uid() then member_b else member_a end into other_id
    from hat_networking.matches where id=p_match_id and event_id=p_event_id and auth.uid() in (member_a,member_b)
      and status in ('completed','closed') and accepted_a and accepted_b;
  if other_id is null then raise exception 'Complete a mutual introduction first'; end if;
  return public.request_connection_with_context(other_id,null,coalesce(p_note,''));
end; $$;

revoke all on function public.get_my_networking_followthrough(uuid),public.defer_networking_connection(uuid,uuid),public.connect_event_networking(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.get_my_networking_followthrough(uuid),public.defer_networking_connection(uuid,uuid),public.connect_event_networking(uuid,uuid,text) to authenticated;

create or replace function public.get_my_networking_updates() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare live jsonb; recent jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) into live from (
    select e.id as event_id,e.slug,e.title,s.ends_at,e.timezone
    from public.event_memberships m join public.events e on e.id=m.event_id
    join hat_networking.sessions s on s.event_id=e.id
    where m.user_id=auth.uid() and s.status='running' and not s.disabled
      and s.starts_at<=now() and s.ends_at>now() and hat_networking.eligible(e.id,auth.uid())
    order by s.ends_at,e.id limit 3
  ) v;
  select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) into recent from (
    select e.id as event_id,e.slug,e.title,e.ends_at,e.timezone,count(*) as people_met
    from public.event_memberships m join public.events e on e.id=m.event_id
    join hat_networking.matches x on x.event_id=e.id and auth.uid() in(x.member_a,x.member_b)
    where m.user_id=auth.uid() and x.status in ('completed','closed') and x.accepted_a and x.accepted_b
      and not public.is_blocked_pair(x.member_a,x.member_b) and hat_networking.eligible(e.id,auth.uid(),false)
    group by e.id order by e.ends_at desc,e.id limit 10
  ) v;
  return jsonb_build_object('live',live,'recent',recent,'server_now',now());
end; $$;
commit;
