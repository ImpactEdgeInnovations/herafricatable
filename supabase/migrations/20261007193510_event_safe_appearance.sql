begin;
alter table public.events add column if not exists appearance_accent_key text not null default 'wine'
  check (appearance_accent_key in ('wine','gold','forest','ocean','terracotta'));
create or replace function public.set_event_appearance(p_event_id uuid,p_accent_key text)
returns text language plpgsql security definer set search_path='' as $$
declare previous text;
begin
  if auth.uid() is null or not public.is_active_member(auth.uid())
    or not (public.can_host_event(p_event_id) or public.can_manage_event(p_event_id)) then
    raise exception 'Active Event Host or Admin required'; end if;
  if p_accent_key is null or p_accent_key not in ('wine','gold','forest','ocean','terracotta') then
    raise exception 'Choose one of the available colours'; end if;
  select appearance_accent_key into previous from public.events where id=p_event_id for update;
  if not found then raise exception 'Event unavailable'; end if;
  update public.events set appearance_accent_key=p_accent_key where id=p_event_id;
  if previous is distinct from p_accent_key then
    insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
      values(auth.uid(),'event.appearance_updated','event',p_event_id,jsonb_build_object('from',previous,'to',p_accent_key));
  end if;
  return p_accent_key;
end; $$;
revoke all on function public.set_event_appearance(uuid,text) from public,anon;
grant execute on function public.set_event_appearance(uuid,text) to authenticated;
commit;
