begin;
-- Applied history version: 20261026115758.
-- Read-only reminders do not join networking, heartbeat participants or tick
-- rounds. Only the event page can do those actions after explicit consent.
create function public.get_my_networking_updates() returns jsonb
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
    where m.user_id=auth.uid() and x.status='completed' and not public.is_blocked_pair(x.member_a,x.member_b)
      and hat_networking.eligible(e.id,auth.uid(),false)
    group by e.id order by e.ends_at desc,e.id limit 10
  ) v;
  return jsonb_build_object('live',live,'recent',recent,'server_now',now());
end;
$$;

create function public.get_my_networking_connection_states(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not hat_networking.eligible(p_event_id,auth.uid(),false) then raise exception 'A valid event place is required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('match_id',x.id,'state',
    case when c.status='accepted' then 'connected'
      when c.status='pending' and c.requester_id=auth.uid() then 'outgoing'
      when c.status='pending' then 'incoming'
      when public.is_active_member(auth.uid()) and public.is_active_member(p.id) then 'available'
      else 'unavailable' end))
    from hat_networking.matches x
    join public.profiles p on p.id=case when x.member_a=auth.uid() then x.member_b else x.member_a end
    left join public.connections c on c.user_low=least(auth.uid(),p.id) and c.user_high=greatest(auth.uid(),p.id)
    where x.event_id=p_event_id and auth.uid() in(x.member_a,x.member_b) and x.status='completed'
      and not public.is_blocked_pair(x.member_a,x.member_b)), '[]'::jsonb);
end;
$$;

create function public.get_my_event_arrival_export(p_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events; result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into e from public.events where slug=p_slug;
  if e.id is null or not hat_event_ops.manager(e.id) then raise exception 'Event Host required'; end if;
  if (select count(*) from public.event_memberships where event_id=e.id and status in('confirmed','attended'))>5000 then
    raise exception 'This event is too large for a single attendance download';
  end if;
  select jsonb_build_object('title',e.title,'timezone',e.timezone,'generated_at',now(),'guests',coalesce(jsonb_agg(jsonb_build_object(
    'name',coalesce(nullif(trim(p.display_name),''),'Guest'),'arrived',c.id is not null,'checked_in_at',c.checked_in_at,
    'checked_in_by',case when c.id is not null then coalesce(nullif(trim(staff.display_name),''),'Check-in staff') end,'method',c.method)
    order by p.display_name,m.user_id),'[]'::jsonb)) into result
  from public.event_memberships m join public.profiles p on p.id=m.user_id
  left join public.event_checkins c on c.event_id=m.event_id and c.user_id=m.user_id and c.reversed_at is null
  left join public.profiles staff on staff.id=c.checked_in_by
  where m.event_id=e.id and m.status in('confirmed','attended');
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
    values(auth.uid(),'event.attendance_export','event',e.id,jsonb_build_object('rows',jsonb_array_length(result->'guests')));
  return result;
end;
$$;
revoke all on function public.get_my_networking_updates(),public.get_my_networking_connection_states(uuid),public.get_my_event_arrival_export(text) from public,anon,authenticated;
grant execute on function public.get_my_networking_updates(),public.get_my_networking_connection_states(uuid),public.get_my_event_arrival_export(text) to authenticated;
commit;
