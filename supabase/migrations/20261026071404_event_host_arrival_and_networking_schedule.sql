begin;
-- Applied history version: 20261026071404.

create schema hat_event_ops;
revoke all on schema hat_event_ops from public,anon,authenticated;
create table hat_event_ops.door_helpers (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key(event_id,user_id)
);
create index door_helpers_user_idx on hat_event_ops.door_helpers(user_id,event_id);
alter table hat_event_ops.door_helpers enable row level security;
revoke all on all tables in schema hat_event_ops from public,anon,authenticated;

-- Separate from can_manage_event: Host arrival access must not grant finance,
-- refund, publishing, reversal or platform-admin permissions.
create function hat_event_ops.host(e uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select u is not null and exists(select 1 from public.event_hosts h
    join public.profiles p on p.id=h.user_id join public.events v on v.id=h.event_id
    where h.event_id=e and h.user_id=u and h.status='active' and p.access_status='active'
      and v.status in ('published','completed'));
$$;
create function hat_event_ops.manager(e uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (hat_event_ops.host(e,auth.uid()) or public.can_manage_event(e));
$$;

create or replace function public.can_operate_event_door(p_event_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    public.can_manage_event(p_event_id)
    or hat_event_ops.host(p_event_id,auth.uid())
    or exists(select 1 from public.event_door_staff ds join public.profiles p on p.id=ds.user_id
      join public.events e on e.id=ds.event_id where ds.event_id=p_event_id and ds.user_id=auth.uid()
        and p.access_status='active' and e.status='published')
    or exists(select 1 from hat_event_ops.door_helpers d join public.profiles p on p.id=d.user_id
      join public.events e on e.id=d.event_id where d.event_id=p_event_id and d.user_id=auth.uid()
        and p.access_status='active' and e.status='published' and hat_event_ops.host(p_event_id,d.granted_by))
  );
$$;

create function public.manage_my_event_door_helper(p_event_id uuid,p_email text,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare person uuid; e public.events; previous_actor uuid;
begin
  if auth.uid() is null or not hat_event_ops.manager(p_event_id) then raise exception 'Event Host required'; end if;
  select * into e from public.events where id=p_event_id for update;
  if e.status<>'published' or e.ends_at<=now() then raise exception 'Choose an upcoming published event'; end if;
  if p_action not in ('assign','remove') or p_action is null then raise exception 'Choose assign or remove'; end if;
  select u.id into person from auth.users u join public.profiles p on p.id=u.id
    where lower(u.email)=lower(trim(coalesce(p_email,''))) and u.email_confirmed_at is not null
      and (p_action='remove' or p.access_status='active');
  if person is null then raise exception 'Use the email of a verified, active member'; end if;
  if person=auth.uid() then raise exception 'You already have access as the Host'; end if;
  if p_action='assign' then
    if not hat_event_ops.host(p_event_id,auth.uid()) then raise exception 'An active event Host must assign helpers here'; end if;
    if not exists(select 1 from hat_event_ops.door_helpers where event_id=p_event_id and user_id=person)
      and (select count(*) from hat_event_ops.door_helpers where event_id=p_event_id)>=10 then
      raise exception 'This event already has ten check-in helpers'; end if;
    insert into hat_event_ops.door_helpers(event_id,user_id,granted_by) values(p_event_id,person,auth.uid())
      on conflict(event_id,user_id) do update set granted_by=auth.uid(),assigned_at=now();
  else
    delete from hat_event_ops.door_helpers where event_id=p_event_id and user_id=person;
  end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
    values(auth.uid(),'event.host_door_helper_'||p_action,'event',p_event_id,jsonb_build_object('user_id',person));
  perform public.enqueue_notification(person,'event',case when p_action='assign' then 'Help welcome guests at ' else 'Check-in access ended for ' end||e.title,
    case when p_action='assign' then 'The Host added you to this event’s check-in team. Sign in and open the check-in page. You can validate passes for this event only.' else 'Your delegated check-in access for this event has ended.' end,
    case when p_action='assign' then '/events/'||e.slug||'/door' else '/events/'||e.slug end,
    'event-door-helper:'||p_event_id||':'||person||':'||p_action||':'||gen_random_uuid());
end;
$$;

create function public.get_my_event_arrival(p_event_id uuid,p_search text default '',p_filter text default 'all',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; e public.events; needle text:=left(trim(coalesce(p_search,'')),100); skip integer:=least(greatest(coalesce(p_offset,0),0),100000);
begin
  if not hat_event_ops.manager(p_event_id) then raise exception 'Event Host required'; end if;
  if p_filter not in ('all','arrived','expected') or p_filter is null then raise exception 'Choose a guest filter'; end if;
  select * into e from public.events where id=p_event_id;
  with guests as (
    select m.user_id,coalesce(nullif(trim(p.display_name),''),'Guest') as name,c.checked_in_at
    from public.event_memberships m join public.profiles p on p.id=m.user_id
    left join public.event_checkins c on c.event_id=m.event_id and c.user_id=m.user_id and c.reversed_at is null
    where m.event_id=p_event_id and m.status in ('confirmed','attended')
  ), filtered as (
    select * from guests where (needle='' or position(lower(needle) in lower(name))>0)
      and (p_filter='all' or (p_filter='arrived' and checked_in_at is not null) or (p_filter='expected' and checked_in_at is null))
  ), page as (select * from filtered order by checked_in_at desc nulls last,name,user_id limit 25 offset skip)
  select jsonb_build_object('expected',(select count(*) from guests),'arrived',(select count(*) from guests where checked_in_at is not null),
    'total',(select count(*) from filtered),'offset',skip,'guests',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
  return result||jsonb_build_object('helpers',coalesce((select jsonb_agg(jsonb_build_object('email',u.email,'name',p.display_name,
    'active',p.access_status='active' and hat_event_ops.host(p_event_id,d.granted_by))) from hat_event_ops.door_helpers d
      join auth.users u on u.id=d.user_id join public.profiles p on p.id=d.user_id where d.event_id=p_event_id),'[]'::jsonb));
end;
$$;

create function public.get_event_networking_schedule(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(public.can_view_event(p_event_id),false) and not hat_event_ops.manager(p_event_id)
    and not exists(select 1 from public.event_memberships where event_id=p_event_id and user_id=auth.uid() and status in ('confirmed','attended')) then return null; end if;
  return (select jsonb_build_object('starts_at',s.starts_at,'ends_at',s.ends_at,'minutes',s.minutes,'status',s.status,'disabled',s.disabled)
    from hat_networking.sessions s join public.events e on e.id=s.event_id where s.event_id=p_event_id and e.status in ('published','completed'));
end;
$$;

-- Enrich only future event-confirmation emails, using the schedule saved at
-- queue time. Existing sent mail is never changed or resent.
create function hat_event_ops.confirmation_networking() returns trigger
language plpgsql security definer set search_path='' as $$
declare line text;
begin
  if new.payload->>'title'='Your event place is confirmed' then
    select 'Networking: '||to_char(s.starts_at at time zone e.timezone,'HH24:MI')||'–'||to_char(s.ends_at at time zone e.timezone,'HH24:MI')||
      ' ('||e.timezone||'). Optional introductions; check in at the venue to take part.' into line
    from public.orders o join public.events e on e.id=o.event_id join hat_networking.sessions s on s.event_id=e.id
    where o.user_id=new.user_id and o.order_type='event' and o.status='fulfilled'
      and new.payload->>'href'='/orders/'||o.reference and not s.disabled and s.status<>'finished';
    if line is not null then new.payload:=jsonb_set(new.payload,'{body}',to_jsonb(left(coalesce(new.payload->>'body',''),750)||E'\n\n'||line)); end if;
  end if;
  return new;
end;
$$;
create trigger event_confirmation_networking before insert on public.notification_jobs
  for each row execute function hat_event_ops.confirmation_networking();

revoke all on all functions in schema hat_event_ops from public,anon,authenticated;
revoke all on function public.manage_my_event_door_helper(uuid,text,text),public.get_my_event_arrival(uuid,text,text,integer),public.get_event_networking_schedule(uuid) from public,anon,authenticated;
grant execute on function public.manage_my_event_door_helper(uuid,text,text),public.get_my_event_arrival(uuid,text,text,integer) to authenticated;
grant execute on function public.get_event_networking_schedule(uuid) to anon,authenticated;
commit;
