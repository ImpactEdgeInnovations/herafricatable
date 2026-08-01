begin;

create table if not exists public.community_circle_cycle_links (
  community_id uuid not null references public.communities(id) on delete cascade,
  cycle_id uuid not null references public.circle_cycles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'removed')),
  linked_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, cycle_id)
);

create index if not exists community_circle_links_cycle_idx
  on public.community_circle_cycle_links(cycle_id, status);

alter table public.community_circle_cycle_links enable row level security;

revoke all on table public.community_circle_cycle_links
  from public, anon, authenticated;

create or replace function public.list_community_circle_programs(
  p_community_id uuid
)
returns table(
  cycle_id uuid,
  cycle_name text,
  cycle_description text,
  cycle_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  group_size integer,
  opt_in_status text,
  my_circle_id uuid,
  my_circle_name text,
  my_circle_member_count bigint,
  my_circle_prompt_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.communities_enabled()
    or not public.circles_enabled()
    or not public.is_active_member(auth.uid())
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    ) then
    raise exception 'Active community and Circle access required';
  end if;

  return query
  select
    cycle.id,
    cycle.name,
    cycle.description,
    cycle.status,
    cycle.starts_at,
    cycle.ends_at,
    cycle.group_size,
    opt_in.status,
    mine.circle_id,
    mine.circle_name,
    mine.member_count,
    mine.prompt_count
  from public.community_circle_cycle_links link
  join public.circle_cycles cycle on cycle.id = link.cycle_id
  left join public.circle_opt_ins opt_in
    on opt_in.cycle_id = cycle.id
   and opt_in.user_id = auth.uid()
  left join lateral (
    select
      circle.id as circle_id,
      circle.name as circle_name,
      (
        select count(*)
        from public.circle_memberships circle_member
        where circle_member.circle_id = circle.id
          and circle_member.status = 'active'
      ) as member_count,
      (
        select count(*)
        from public.circle_prompts prompt
        where prompt.circle_id = circle.id
          and prompt.status = 'published'
          and prompt.opens_at <= now()
      ) as prompt_count
    from public.circles circle
    join public.circle_memberships mine_membership
      on mine_membership.circle_id = circle.id
     and mine_membership.user_id = auth.uid()
     and mine_membership.status = 'active'
    where circle.cycle_id = cycle.id
      and circle.status in ('published', 'completed')
    limit 1
  ) mine on true
  where link.community_id = p_community_id
    and link.status = 'active'
    and cycle.status in ('open', 'matched', 'published', 'completed')
  order by
    case cycle.status
      when 'open' then 0
      when 'matched' then 1
      when 'published' then 2
      else 3
    end,
    cycle.starts_at desc;
end;
$$;

create or replace function public.list_community_circle_options(
  p_community_id uuid
)
returns table(
  cycle_id uuid,
  cycle_name text,
  cycle_description text,
  cycle_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  group_size integer,
  is_linked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.communities_enabled()
    or not public.circles_enabled()
    or not public.can_manage_community(p_community_id) then
    raise exception 'Community host and Circle access required';
  end if;

  return query
  select
    cycle.id,
    cycle.name,
    cycle.description,
    cycle.status,
    cycle.starts_at,
    cycle.ends_at,
    cycle.group_size,
    exists (
      select 1
      from public.community_circle_cycle_links link
      where link.community_id = p_community_id
        and link.cycle_id = cycle.id
        and link.status = 'active'
    )
  from public.circle_cycles cycle
  where cycle.status in ('open', 'matched', 'published', 'completed')
  order by cycle.starts_at desc;
end;
$$;

create or replace function public.set_community_circle_cycle_link(
  p_community_id uuid,
  p_cycle_id uuid,
  p_linked boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_cycle_status text;
begin
  if not public.communities_enabled()
    or not public.circles_enabled()
    or not public.can_manage_community(p_community_id) then
    raise exception 'Community host and Circle access required';
  end if;

  select cycle.status
  into target_cycle_status
  from public.circle_cycles cycle
  where cycle.id = p_cycle_id
  for share;

  if target_cycle_status is null
    or target_cycle_status not in ('open', 'matched', 'published', 'completed') then
    raise exception 'Available Circle cycle required';
  end if;

  insert into public.community_circle_cycle_links(
    community_id,
    cycle_id,
    status,
    linked_by,
    updated_at
  )
  values (
    p_community_id,
    p_cycle_id,
    case when p_linked then 'active' else 'removed' end,
    auth.uid(),
    now()
  )
  on conflict (community_id, cycle_id)
  do update set
    status = excluded.status,
    linked_by = auth.uid(),
    updated_at = now();

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    case when p_linked
      then 'community.circle_cycle_linked'
      else 'community.circle_cycle_unlinked'
    end,
    'community',
    p_community_id,
    jsonb_build_object(
      'cycle_id', p_cycle_id,
      'cycle_status', target_cycle_status
    )
  );
end;
$$;

revoke all on function public.list_community_circle_programs(uuid)
  from public;
grant execute on function public.list_community_circle_programs(uuid)
  to authenticated;

revoke all on function public.list_community_circle_options(uuid)
  from public;
grant execute on function public.list_community_circle_options(uuid)
  to authenticated;

revoke all on function public.set_community_circle_cycle_link(
  uuid,
  uuid,
  boolean
) from public;
grant execute on function public.set_community_circle_cycle_link(
  uuid,
  uuid,
  boolean
) to authenticated;

comment on table public.community_circle_cycle_links is
  'Host-curated relevance between a Community and Circle cycle. It never grants Circle membership or roster access.';
comment on function public.list_community_circle_programs is
  'Shows Community members cycle context and only their own published Circle assignment; other Circle rosters remain private.';

commit;
