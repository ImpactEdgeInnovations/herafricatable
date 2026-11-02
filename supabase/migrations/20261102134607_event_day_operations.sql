begin;
-- Applied history version: 20261102134607.

-- Private attendance intentions, not cancellations or refunds. Door helpers
-- deliberately have no table/schema access and cannot read these notes.
create table hat_event_ops.attendance_plans (
  event_id uuid not null,
  user_id uuid not null,
  status text not null check(status in ('as_planned','running_late','not_attending')),
  note text not null default '' check(char_length(note)<=280),
  updated_at timestamptz not null default now(),
  primary key(event_id,user_id),
  foreign key(event_id,user_id) references public.event_memberships(event_id,user_id) on delete cascade
);
alter table hat_event_ops.attendance_plans enable row level security;
revoke all on hat_event_ops.attendance_plans from public,anon,authenticated;

create function public.get_my_event_attendance_plan(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select jsonb_build_object('status',coalesce(a.status,'as_planned'),'note',coalesce(a.note,''),'updated_at',a.updated_at,
    'can_edit',e.status='published' and e.ends_at>now() and m.status='confirmed'
      and not exists(select 1 from public.event_checkins c where c.event_id=m.event_id and c.user_id=m.user_id and c.reversed_at is null))
  into result from public.event_memberships m join public.events e on e.id=m.event_id
    join public.profiles p on p.id=m.user_id
    left join hat_event_ops.attendance_plans a on a.event_id=m.event_id and a.user_id=m.user_id
  where m.event_id=p_event_id and m.user_id=auth.uid() and m.status in ('confirmed','attended')
    and p.access_status in ('active','pending')
    and (m.order_id is null or exists(select 1 from public.orders o where o.id=m.order_id and o.status in ('paid','approved','fulfilled')));
  if result is null then raise exception 'A confirmed event place is required'; end if;
  return result;
end; $$;

create function public.set_my_event_attendance_plan(p_event_id uuid,p_status text,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare state jsonb; clean_note text:=trim(coalesce(p_note,''));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_status is null or p_status not in ('as_planned','running_late','not_attending') then raise exception 'Choose an attendance update'; end if;
  if char_length(clean_note)>280 then raise exception 'Keep your note within 280 characters'; end if;
  -- Serialize with membership/check-in changes. Never touch orders, credentials
  -- or capacity. Check-in locks this same membership row before changing it.
  perform 1 from public.event_memberships where event_id=p_event_id and user_id=auth.uid() for update;
  state:=public.get_my_event_attendance_plan(p_event_id);
  if not (state->>'can_edit')::boolean then raise exception 'Arrival updates are closed. Contact the Host if you need help'; end if;
  insert into hat_event_ops.attendance_plans(event_id,user_id,status,note)
  values(p_event_id,auth.uid(),p_status,case when p_status='as_planned' then '' else clean_note end)
  on conflict(event_id,user_id) do update set status=excluded.status,note=excluded.note,updated_at=now();
  return public.get_my_event_attendance_plan(p_event_id);
end; $$;

-- Read-only monitoring: unlike get_event_networking, this does not heartbeat,
-- opt anyone in or advance rounds. Counts are people, not pairs.
create function hat_event_ops.networking_overview(e uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s hat_networking.sessions; counts jsonb;
begin
  select * into s from hat_networking.sessions where event_id=e;
  if not found then return null; end if;
  if s.status='running' and not s.disabled and s.starts_at<=now() and s.ends_at>now()
    and exists(select 1 from public.events where id=e and status='published' and ends_at>now()) then
    with valid_matches as (
      select x.* from hat_networking.matches x where x.event_id=e and x.ends_at>now()
        and ((x.status='active' and x.accepted_a and x.accepted_b) or (x.status='offered' and x.accept_by>now()))
        and hat_networking.eligible(e,x.member_a) and hat_networking.eligible(e,x.member_b)
        and not public.is_blocked_pair(x.member_a,x.member_b)
        and exists(select 1 from hat_networking.participants a where a.event_id=e and a.user_id=x.member_a and a.ready and a.ended_match_id is null
          and (x.status='active' or a.seen_at>now()-interval '60 seconds'))
        and exists(select 1 from hat_networking.participants a where a.event_id=e and a.user_id=x.member_b and a.ready and a.ended_match_id is null
          and (x.status='active' or a.seen_at>now()-interval '60 seconds'))
    ), paired_rows as (
      select member_a as user_id,status from valid_matches union select member_b,status from valid_matches
    ), paired as (
      select user_id,case when bool_or(status='active') then 'active' else 'offered' end as status from paired_rows group by user_id
    ), people as (
      select a.*,p.status as pair_status from hat_networking.participants a left join paired p using(user_id)
        where a.event_id=e and hat_networking.eligible(e,a.user_id)
    ) select jsonb_build_object('talking',count(*) filter(where pair_status='active'),
      'offered',count(*) filter(where pair_status='offered'),
      'waiting',count(*) filter(where pair_status is null and ready and seen_at>now()-interval '60 seconds' and ended_match_id is null),
      'away',count(*) filter(where pair_status is null and (not ready or seen_at<=now()-interval '60 seconds' or ended_match_id is not null))) into counts from people;
  end if;
  return jsonb_build_object('status',case when s.ends_at<=now() then 'finished' else s.status end,'disabled',s.disabled,
    'starts_at',s.starts_at,'ends_at',s.ends_at,'round_no',s.round_no,'round_ends_at',s.round_ends_at,'counts',counts);
end; $$;
revoke all on function hat_event_ops.networking_overview(uuid) from public,anon,authenticated;

create function public.get_event_networking_live_counts(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not hat_networking.manager(p_event_id) then raise exception 'Networking Host access required'; end if;
  return coalesce(hat_event_ops.networking_overview(p_event_id),'{"counts":null}'::jsonb);
end; $$;
revoke all on function public.get_event_networking_live_counts(uuid) from public,anon,authenticated;
grant execute on function public.get_event_networking_live_counts(uuid) to authenticated;

create function public.get_event_day_overview(p_event_id uuid,p_search text default '',p_filter text default 'all',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; needle text:=left(trim(coalesce(p_search,'')),100); skip integer:=least(greatest(coalesce(p_offset,0),0),100000);
begin
  if auth.uid() is null or not hat_event_ops.manager(p_event_id) then raise exception 'Event Host access required'; end if;
  if p_filter is null or p_filter not in ('all','checked_in','not_checked_in','running_late','not_attending') then raise exception 'Choose a guest filter'; end if;
  with guests as (
    select m.user_id,coalesce(nullif(trim(p.display_name),''),'Guest') as name,c.checked_in_at,
      case when c.id is not null then coalesce(nullif(trim(staff.display_name),''),'Check-in staff') end as checked_in_by_name,
      coalesce(a.status,'as_planned') as plan,a.note,a.updated_at
    from public.event_memberships m join public.profiles p on p.id=m.user_id
    left join public.event_checkins c on c.event_id=m.event_id and c.user_id=m.user_id and c.reversed_at is null
    left join public.profiles staff on staff.id=c.checked_in_by
    left join hat_event_ops.attendance_plans a on a.event_id=m.event_id and a.user_id=m.user_id
    where m.event_id=p_event_id and m.status in ('confirmed','attended')
      and (m.order_id is null or exists(select 1 from public.orders o where o.id=m.order_id and o.status in ('paid','approved','fulfilled')))
  ), filtered as (
    select * from guests where (needle='' or position(lower(needle) in lower(name))>0)
    and (p_filter='all' or (p_filter='checked_in' and checked_in_at is not null)
      or (p_filter='not_checked_in' and checked_in_at is null)
      or (p_filter in ('running_late','not_attending') and checked_in_at is null and plan=p_filter))
  ), bounds as (
    select case when count(*)=0 then 0 else least(skip,((count(*)-1)/25)*25)::integer end as actual_offset from filtered
  ), page as (select * from filtered order by checked_in_at desc nulls last,name,user_id limit 25 offset(select actual_offset from bounds))
  select jsonb_build_object('server_now',now(),'confirmed',(select count(*) from guests),
    'checked_in',(select count(*) from guests where checked_in_at is not null),
    'not_checked_in',(select count(*) from guests where checked_in_at is null),
    'running_late',(select count(*) from guests where checked_in_at is null and plan='running_late'),
    'not_attending',(select count(*) from guests where checked_in_at is null and plan='not_attending'),
    'total',(select count(*) from filtered),'offset',(select actual_offset from bounds),
    'guests',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
    'networking',hat_event_ops.networking_overview(p_event_id)) into result;
  return result;
end; $$;

revoke all on function public.get_my_event_attendance_plan(uuid) from public,anon,authenticated;
revoke all on function public.set_my_event_attendance_plan(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_event_day_overview(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.get_my_event_attendance_plan(uuid),public.set_my_event_attendance_plan(uuid,text,text),public.get_event_day_overview(uuid,text,text,integer) to authenticated;
commit;
