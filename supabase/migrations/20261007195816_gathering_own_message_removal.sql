begin;
create or replace function public.remove_my_community_gathering_message(p_message_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.community_gathering_messages%rowtype; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to remove your message'; end if;
  select * into target from public.community_gathering_messages where id=p_message_id for update;
  if not found or target.author_id<>actor or not public.can_access_community_gathering(target.room_id,actor) then
    raise exception 'Your message is not available';
  end if;
  if target.status='removed' then return; end if;
  update public.community_gathering_messages set status='removed',body='[Removed by its author]',
    is_pinned=false,pinned_by=null,pinned_at=null,updated_at=now() where id=target.id;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values(actor,'community.gathering_message_author_removed','community_gathering_message',target.id,
    jsonb_build_object('community_id',target.community_id,'event_id',target.event_id));
end; $$;
revoke all on function public.remove_my_community_gathering_message(uuid) from public,anon;
grant execute on function public.remove_my_community_gathering_message(uuid) to authenticated;
commit;
