begin;

create table if not exists public.community_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete restrict,
  action text not null check (action in ('paused', 'host_replaced', 'reopened', 'closed')),
  reason text not null check (char_length(reason) between 10 and 1000),
  previous_status text not null,
  successor_user_id uuid references auth.users(id) on delete set null,
  affected_member_count integer not null default 0 check (affected_member_count >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists community_lifecycle_events_history_idx
  on public.community_lifecycle_events(community_id, created_at desc);
alter table public.community_lifecycle_events enable row level security;
revoke all on table public.community_lifecycle_events from anon, authenticated;

drop policy if exists "Super admins read Community lifecycle history"
  on public.community_lifecycle_events;
create policy "Super admins read Community lifecycle history"
  on public.community_lifecycle_events for select
  to authenticated
  using (public.is_admin(array['super_admin']::public.app_role[]));
grant select on public.community_lifecycle_events to authenticated;

create or replace function public.manage_community_lifecycle(
  p_community_id uuid,
  p_action text,
  p_reason text,
  p_successor_membership_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.communities%rowtype;
  successor public.community_memberships%rowtype;
  affected integer := 0;
  member_record record;
  event_action text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_action not in ('pause', 'replace_host', 'reopen', 'close') then
    raise exception 'Unsupported Community lifecycle action';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'A clear operational reason is required';
  end if;

  select * into target from public.communities
  where id = p_community_id for update;
  if not found then raise exception 'Community not found'; end if;

  if p_action = 'replace_host' then
    select * into successor
    from public.community_memberships
    where id = p_successor_membership_id
      and community_id = p_community_id
      and status in ('active', 'paused', 'suspended')
      and role <> 'owner'
    for update;
    if not found then
      raise exception 'Choose an existing member or moderator as the successor';
    end if;

    update public.community_memberships
    set role = 'member',
        status = case when status = 'suspended' then 'paused' else status end,
        updated_at = now()
    where community_id = p_community_id and role = 'owner';
    update public.community_memberships
    set role = 'owner', status = 'active', reviewed_by = actor, updated_at = now()
    where id = successor.id;
    event_action := 'host_replaced';
    perform public.enqueue_notification(
      successor.user_id,
      'community',
      'You are now the Community host',
      'Ownership was transferred by Her Africa Table. Open Host tools to review the room before continuing.',
      '/communities',
      'community-host-replaced:' || p_community_id || ':' || successor.user_id
    );
  elsif p_action = 'pause' then
    if target.status = 'archived' then raise exception 'Closed Communities cannot be paused'; end if;
    update public.communities set status = 'draft', updated_at = now()
    where id = p_community_id;
    update public.community_memberships
    set status = case when role = 'owner' then 'suspended' else 'paused' end,
        updated_at = now()
    where community_id = p_community_id
      and status = 'active'
      and role <> 'moderator';
    get diagnostics affected = row_count;
    event_action := 'paused';
  elsif p_action = 'reopen' then
    if not exists (
      select 1 from public.community_memberships
      where community_id = p_community_id and role = 'owner' and status = 'active'
    ) or not exists (
      select 1 from public.community_memberships
      where community_id = p_community_id and role = 'moderator' and status = 'active'
    ) then
      raise exception 'An active host and backup moderator are required';
    end if;
    if not public.community_release_ready(p_community_id) then
      raise exception 'Community release acceptance must pass before reopening';
    end if;
    update public.communities set status = 'published', updated_at = now()
    where id = p_community_id;
    update public.community_memberships
    set status = 'active', updated_at = now()
    where community_id = p_community_id and status in ('paused', 'suspended');
    get diagnostics affected = row_count;
    event_action := 'reopened';
  else
    update public.communities set status = 'archived', updated_at = now()
    where id = p_community_id;
    update public.community_memberships
    set status = case when role in ('owner', 'moderator') then 'suspended' else 'paused' end,
        updated_at = now()
    where community_id = p_community_id and status = 'active';
    get diagnostics affected = row_count;
    event_action := 'closed';
  end if;

  if p_action in ('pause', 'reopen', 'close') then
    for member_record in
      select membership.user_id
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.status in ('active', 'paused', 'suspended')
        and membership.user_id <> actor
    loop
      perform public.enqueue_notification(
        member_record.user_id,
        'community',
        case p_action
          when 'pause' then target.name || ' is temporarily paused'
          when 'reopen' then target.name || ' has reopened'
          else target.name || ' has closed'
        end,
        case p_action
          when 'pause' then 'Conversations and member access are preserved while the Her Africa Table team supports the host transition.'
          when 'reopen' then 'Your membership and previous contributions are available again.'
          else 'The room is closed to new activity. Existing records remain preserved under the platform retention policy.'
        end,
        '/communities',
        'community-lifecycle:' || p_community_id || ':' || event_action || ':' || member_record.user_id
      );
    end loop;
  end if;

  insert into public.community_lifecycle_events(
    community_id, action, reason, previous_status, successor_user_id,
    affected_member_count, created_by
  ) values (
    p_community_id, event_action, trim(p_reason), target.status,
    successor.user_id, affected, actor
  );
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(
    actor,
    'community.lifecycle_' || event_action,
    'community',
    p_community_id,
    jsonb_build_object(
      'previous_status', target.status,
      'successor_user_id', successor.user_id,
      'affected_member_count', affected
    )
  );
end;
$$;

revoke all on function public.manage_community_lifecycle(uuid, text, text, uuid)
  from public;
grant execute on function public.manage_community_lifecycle(uuid, text, text, uuid)
  to authenticated;

comment on table public.community_lifecycle_events is
  'Audited Community pause, host replacement, reopening and closure history. Member content is preserved.';

commit;
