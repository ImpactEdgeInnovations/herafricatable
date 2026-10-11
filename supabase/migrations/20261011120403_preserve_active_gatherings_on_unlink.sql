begin;

-- Version aligned with the applied live migration history.

-- Unlinking used to cascade-delete a gathering and its activity. Empty rooms
-- can still be unlinked; populated rooms require an explicit future archive flow.
create or replace function public.preserve_active_gathering_on_unlink()
returns trigger language plpgsql security definer set search_path='' as $$
declare room public.community_gathering_rooms;
begin
  -- Preserve normal parent-record cleanup; this guard is for unlinking an
  -- existing event from an existing Community, not Community/account erasure.
  if not exists(select 1 from public.communities where id=old.community_id)
    or not exists(select 1 from public.events where id=old.event_id) then return old;end if;
  select * into room from public.community_gathering_rooms
    where community_id=old.community_id and event_id=old.event_id for update;
  if not found then return old;end if;
  if room.meeting_url is not null or room.recap_body is not null or room.recap_post_id is not null
    or room.chat_mode<>'open' or not room.chat_enabled
    or exists(select 1 from public.community_gathering_rsvps where room_id=room.id)
    or exists(select 1 from public.community_gathering_messages where room_id=room.id)
    or exists(select 1 from public.community_gathering_questions where room_id=room.id)
    or exists(select 1 from public.community_gathering_discussions where room_id=room.id)
    or exists(select 1 from public.community_gathering_videos where room_id=room.id)
    or exists(select 1 from public.community_photo_albums where room_id=room.id) then
    raise exception 'This gathering already has member activity or saved content. Keep it linked to protect its conversations and photos. Contact support if it needs to be moved.';
  end if;
  return old;
end;
$$;
revoke all on function public.preserve_active_gathering_on_unlink() from public,anon,authenticated;
create trigger preserve_active_gathering_before_unlink
before delete on public.community_event_links
for each row execute function public.preserve_active_gathering_on_unlink();

commit;
