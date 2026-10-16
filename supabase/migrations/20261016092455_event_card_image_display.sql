begin;

alter table public.events add column if not exists card_image_style text not null default 'automatic'
  check (card_image_style in ('automatic', 'complete'));

create or replace function public.list_event_card_image_styles(p_event_ids uuid[])
returns table(event_id uuid, image_style text)
language sql stable security definer set search_path = '' as $$
  select event.id, event.card_image_style from public.events event
  where event.id = any(p_event_ids[1:1000])
    and (event.status = 'published' or public.can_host_event(event.id) or public.can_manage_event(event.id));
$$;
revoke all on function public.list_event_card_image_styles(uuid[]) from public;
grant execute on function public.list_event_card_image_styles(uuid[]) to anon, authenticated;

create or replace function public.save_event_card_image_style(p_event_id uuid, p_style text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (public.can_host_event(p_event_id) or public.can_manage_event(p_event_id)) then
    raise exception 'Only the active Event Host or event team can change this image display.' using errcode = '42501';
  end if;
  if p_style is null or p_style not in ('automatic', 'complete') then
    raise exception 'Choose automatic photo fit or show the whole poster.';
  end if;
  update public.events set card_image_style = p_style where id = p_event_id;
  if not found then raise exception 'This event is no longer available.'; end if;
  return p_style;
end;
$$;
revoke all on function public.save_event_card_image_style(uuid,text) from public, anon;
grant execute on function public.save_event_card_image_style(uuid,text) to authenticated;

commit;
