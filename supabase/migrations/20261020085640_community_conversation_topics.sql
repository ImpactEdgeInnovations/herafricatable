begin;

-- Private configuration: reads and writes go through membership-scoped RPCs.
create table if not exists public.community_conversation_topic_settings (
  community_id uuid primary key references public.communities(id) on delete cascade,
  enabled_topics text[] not null check (
    cardinality(enabled_topics) between 1 and 8
    and array_position(enabled_topics, null) is null
    and enabled_topics <@ array['discussion','introduction','ask','offer','opportunity','resource','event_follow_up','win']::text[]
  ),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.community_conversation_topic_settings enable row level security;
revoke all on public.community_conversation_topic_settings from public, anon, authenticated;
create index if not exists community_conversation_topics_updater_idx
  on public.community_conversation_topic_settings(updated_by) where updated_by is not null;

create or replace function public.get_community_conversation_topics(p_community_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.communities_enabled()
    or not public.is_active_member(auth.uid())
    or not exists (select 1 from public.community_memberships m
      where m.community_id=p_community_id and m.user_id=auth.uid() and m.status='active') then
    raise exception 'Active community membership required';
  end if;
  return coalesce((select s.enabled_topics from public.community_conversation_topic_settings s
    where s.community_id=p_community_id),
    array['discussion','introduction','ask','offer','opportunity','resource','event_follow_up','win']::text[]);
end;
$$;
revoke all on function public.get_community_conversation_topics(uuid) from public, anon;
grant execute on function public.get_community_conversation_topics(uuid) to authenticated;

create or replace function public.set_community_conversation_topics(p_community_id uuid,p_topics text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  allowed constant text[] := array['discussion','introduction','ask','offer','opportunity','resource','event_follow_up','win'];
  normalized text[];
begin
  if auth.uid() is null or not public.communities_enabled()
    or not public.is_active_member(auth.uid())
    or not public.can_manage_community(p_community_id)
    or not exists(select 1 from public.communities c where c.id=p_community_id and c.status in ('draft','published')) then
    raise exception 'Community Host or moderator required';
  end if;
  if p_topics is null or cardinality(p_topics) not between 1 and 8
    or array_position(p_topics,null) is not null or not p_topics <@ allowed then
    raise exception 'Choose at least one supported topic';
  end if;
  select array_agg(item.topic order by item.position) into normalized
  from unnest(allowed) with ordinality as item(topic,position) where item.topic=any(p_topics);
  insert into public.community_conversation_topic_settings(community_id,enabled_topics,updated_by)
    values(p_community_id,normalized,auth.uid())
    on conflict(community_id) do update set enabled_topics=excluded.enabled_topics,
      updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
    values(auth.uid(),'community.conversation_topics_changed','community',p_community_id,
      jsonb_build_object('enabled_topics',normalized));
  return normalized;
end;
$$;
revoke all on function public.set_community_conversation_topics(uuid,text[]) from public, anon;
grant execute on function public.set_community_conversation_topics(uuid,text[]) to authenticated;

-- Enforce on every insert route, including older clients. Existing posts/replies
-- remain readable and editable; changing a post's topic must respect the setting.
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
drop trigger if exists community_conversation_topic_guard on public.community_posts;
create trigger community_conversation_topic_guard before insert or update of category,community_id
  on public.community_posts for each row execute function public.enforce_community_conversation_topic();
notify pgrst,'reload schema';
commit;
