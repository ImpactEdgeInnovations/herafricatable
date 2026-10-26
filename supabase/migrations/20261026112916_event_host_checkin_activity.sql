begin;
-- Applied history version: 20261026112916.
-- Host-only attendance attribution. Reuse the event-scoped guard; no new role,
-- approval, direct-table access or helper privilege is introduced.
create or replace function public.get_my_event_arrival(p_event_id uuid,p_search text default '',p_filter text default 'all',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; needle text:=left(trim(coalesce(p_search,'')),100); skip integer:=least(greatest(coalesce(p_offset,0),0),100000);
begin
  if auth.uid() is null or not hat_event_ops.manager(p_event_id) then raise exception 'Event Host required'; end if;
  if p_filter not in ('all','arrived','expected') or p_filter is null then raise exception 'Choose a guest filter'; end if;
  with guests as (
    select m.user_id,coalesce(nullif(trim(p.display_name),''),'Guest') as name,c.checked_in_at,
      case when c.id is not null then coalesce(nullif(trim(staff.display_name),''),'Check-in staff') end as checked_in_by_name,c.method
    from public.event_memberships m join public.profiles p on p.id=m.user_id
    left join public.event_checkins c on c.event_id=m.event_id and c.user_id=m.user_id and c.reversed_at is null
    left join public.profiles staff on staff.id=c.checked_in_by
    where m.event_id=p_event_id and m.status in ('confirmed','attended')
  ), filtered as (
    select * from guests where (needle='' or position(lower(needle) in lower(name))>0)
      and (p_filter='all' or (p_filter='arrived' and checked_in_at is not null) or (p_filter='expected' and checked_in_at is null))
  ), bounds as (
    select case when count(*)=0 then 0 else least(skip,((count(*)-1)/25)*25)::integer end as actual_offset from filtered
  ), page as (select * from filtered order by checked_in_at desc nulls last,name,user_id limit 25 offset (select actual_offset from bounds))
  select jsonb_build_object('expected',(select count(*) from guests),'arrived',(select count(*) from guests where checked_in_at is not null),
    'total',(select count(*) from filtered),'offset',(select actual_offset from bounds),'guests',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
  return result||jsonb_build_object('helpers',coalesce((select jsonb_agg(jsonb_build_object('email',u.email,'name',p.display_name,
    'active',p.access_status='active' and hat_event_ops.host(p_event_id,d.granted_by)) order by d.assigned_at) from hat_event_ops.door_helpers d
      join auth.users u on u.id=d.user_id join public.profiles p on p.id=d.user_id where d.event_id=p_event_id),'[]'::jsonb),
    'activity',coalesce((
      select jsonb_agg(to_jsonb(a) order by a.checked_in desc,a.name,a.operator_id) from (
        select c.checked_in_by as operator_id,coalesce(nullif(trim(p.display_name),''),'Check-in staff') as name,
          count(*) filter(where c.reversed_at is null and m.status in ('confirmed','attended')) as checked_in,
          count(*) filter(where c.reversed_at is null and m.status in ('confirmed','attended') and c.method='qr') as qr,
          count(*) filter(where c.reversed_at is null and m.status in ('confirmed','attended') and c.method='manual') as manual,
          count(*) filter(where c.reversed_at is not null) as reversed,
          min(c.checked_in_at) filter(where c.reversed_at is null and m.status in ('confirmed','attended')) as first_check_in,
          max(c.checked_in_at) filter(where c.reversed_at is null and m.status in ('confirmed','attended')) as last_check_in
        from public.event_checkins c left join public.profiles p on p.id=c.checked_in_by
        left join public.event_memberships m on m.event_id=c.event_id and m.user_id=c.user_id
        where c.event_id=p_event_id group by c.checked_in_by,p.display_name
      ) a),'[]'::jsonb));
end;
$$;
revoke all on function public.get_my_event_arrival(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.get_my_event_arrival(uuid,text,text,integer) to authenticated;
commit;
