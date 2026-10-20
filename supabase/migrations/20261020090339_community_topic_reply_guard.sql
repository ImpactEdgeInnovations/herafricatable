begin;
-- Replies share community_posts with their parent conversations. A closed topic
-- stops new roots only; it never locks the replies to an existing conversation.
create or replace function public.enforce_community_conversation_topic()
returns trigger language plpgsql security definer set search_path = '' as $$
declare enabled text[];
begin
  if new.parent_post_id is not null then return new; end if;
  if tg_op='UPDATE' and new.category is not distinct from old.category
    and new.community_id is not distinct from old.community_id then return new; end if;
  if new.category in ('start_here','announcement') then return new; end if;
  select s.enabled_topics into enabled from public.community_conversation_topic_settings s
    where s.community_id=new.community_id for share;
  if enabled is not null and not new.category=any(enabled) then
    raise exception 'This topic is closed for new conversations. Choose another topic.';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_community_conversation_topic() from public, anon, authenticated;
commit;
