begin;
-- Applied history version: 20261026072143.
create or replace function public.manage_my_event_door_helper(p_event_id uuid,p_email text,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare person uuid; e public.events; previous_actor uuid;
begin
  if auth.uid() is null or not hat_event_ops.manager(p_event_id) then raise exception 'Event Host required'; end if;
  select * into e from public.events where id=p_event_id for update;
  if p_action not in ('assign','remove') or p_action is null then raise exception 'Choose assign or remove'; end if;
  if p_action='assign' and (e.status<>'published' or e.ends_at<=now()) then raise exception 'Choose an upcoming published event'; end if;
  select u.id into person from auth.users u join public.profiles p on p.id=u.id
    where lower(u.email)=lower(trim(coalesce(p_email,''))) and u.email_confirmed_at is not null
      and (p_action='remove' or p.access_status='active');
  if person is null then raise exception 'Use the email of a verified, active member'; end if;
  if person=auth.uid() then raise exception 'You already have access as the Host'; end if;
  if p_action='assign' then
    if not hat_event_ops.host(p_event_id,auth.uid()) then raise exception 'An active event Host must assign helpers here'; end if;
    select granted_by into previous_actor from hat_event_ops.door_helpers where event_id=p_event_id and user_id=person;
    if previous_actor=auth.uid() then return; end if;
    if previous_actor is null and (select count(*) from hat_event_ops.door_helpers where event_id=p_event_id)>=10 then
      raise exception 'This event already has ten check-in helpers'; end if;
    insert into hat_event_ops.door_helpers(event_id,user_id,granted_by) values(p_event_id,person,auth.uid())
      on conflict(event_id,user_id) do update set granted_by=auth.uid(),assigned_at=now();
  else
    delete from hat_event_ops.door_helpers where event_id=p_event_id and user_id=person;
    if not found then return; end if;
  end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
    values(auth.uid(),'event.host_door_helper_'||p_action,'event',p_event_id,jsonb_build_object('user_id',person));
  perform public.enqueue_notification(person,'event',case when p_action='assign' then 'Help welcome guests at ' else 'Check-in access ended for ' end||e.title,
    case when p_action='assign' then 'The Host added you to this event’s check-in team. Sign in and open the check-in page. You can validate passes for this event only.' else 'Your delegated check-in access for this event has ended.' end,
    case when p_action='assign' then '/events/'||e.slug||'/door' else '/events/'||e.slug end,
    'event-door-helper:'||p_event_id||':'||person||':'||p_action||':'||gen_random_uuid());
end;
$$;
commit;
