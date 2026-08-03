begin;

create table if not exists public.community_check_ins (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(question) between 10 and 220),
  status text not null default 'open'
    check (status in ('open', 'closed', 'removed')),
  closes_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or closes_at > created_at)
);

create table if not exists public.community_check_in_options (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.community_check_ins(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  position smallint not null check (position between 1 and 6),
  unique (check_in_id, position),
  unique (check_in_id, id)
);

create table if not exists public.community_check_in_responses (
  check_in_id uuid not null references public.community_check_ins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (check_in_id, user_id),
  foreign key (check_in_id, option_id)
    references public.community_check_in_options(check_in_id, id)
    on delete cascade
);

create index if not exists community_check_ins_feed_idx
  on public.community_check_ins (community_id, status, created_at desc);
create index if not exists community_check_in_responses_option_idx
  on public.community_check_in_responses (check_in_id, option_id);

alter table public.community_check_ins enable row level security;
alter table public.community_check_in_options enable row level security;
alter table public.community_check_in_responses enable row level security;

revoke all on table public.community_check_ins from anon, authenticated;
revoke all on table public.community_check_in_options from anon, authenticated;
revoke all on table public.community_check_in_responses from anon, authenticated;

create or replace function public.list_community_check_ins(
  p_community_id uuid,
  p_limit integer default 8
)
returns table (
  check_in_id uuid,
  creator_id uuid,
  creator_name text,
  question text,
  status text,
  closes_at timestamptz,
  created_at timestamptz,
  response_count bigint,
  results_visible boolean,
  my_option_id uuid,
  can_close boolean,
  can_remove boolean,
  options jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = actor
        and membership.status = 'active'
    )
  then
    raise exception 'Active community membership required';
  end if;

  return query
  select
    check_in.id,
    check_in.creator_id,
    creator.display_name,
    check_in.question,
    case
      when check_in.status = 'open'
        and check_in.closes_at is not null
        and check_in.closes_at <= now()
      then 'closed'
      else check_in.status
    end,
    check_in.closes_at,
    check_in.created_at,
    response_total.response_count,
    response_total.response_count >= 3,
    my_response.option_id,
    check_in.status = 'open'
      and (check_in.creator_id = actor or public.can_manage_community(p_community_id, actor)),
    check_in.creator_id = actor or public.can_manage_community(p_community_id, actor),
    coalesce(option_list.options, '[]'::jsonb)
  from public.community_check_ins check_in
  join public.profiles creator on creator.id = check_in.creator_id
  cross join lateral (
    select count(*) as response_count
    from public.community_check_in_responses response
    where response.check_in_id = check_in.id
  ) response_total
  left join public.community_check_in_responses my_response
    on my_response.check_in_id = check_in.id
   and my_response.user_id = actor
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'option_id', option.id,
        'label', option.label,
        'position', option.position,
        'response_count', case
          when response_total.response_count >= 3 then (
            select count(*)
            from public.community_check_in_responses option_response
            where option_response.check_in_id = check_in.id
              and option_response.option_id = option.id
          )
          else null
        end
      ) order by option.position
    ) as options
    from public.community_check_in_options option
    where option.check_in_id = check_in.id
  ) option_list
  where check_in.community_id = p_community_id
    and check_in.status <> 'removed'
    and creator.access_status = 'active'
    and not public.is_blocked_pair(actor, check_in.creator_id)
  order by
    case
      when check_in.status = 'open'
        and (check_in.closes_at is null or check_in.closes_at > now())
      then 0 else 1
    end,
    check_in.created_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
end;
$$;

create or replace function public.create_community_check_in(
  p_community_id uuid,
  p_question text,
  p_options text[],
  p_duration_days integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved uuid;
  clean_question text := trim(coalesce(p_question, ''));
  clean_options text[];
  option_label text;
  option_position integer := 0;
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = actor
        and membership.status = 'active'
    )
  then
    raise exception 'Active community membership required';
  end if;
  if char_length(clean_question) not between 10 and 220 then
    raise exception 'Question must be between 10 and 220 characters';
  end if;
  if p_duration_days is not null and p_duration_days not in (3, 7, 14, 30) then
    raise exception 'Choose 3, 7, 14 or 30 days';
  end if;

  select array_agg(trim(option_value) order by option_order)
  into clean_options
  from unnest(coalesce(p_options, array[]::text[]))
    with ordinality as source(option_value, option_order)
  where nullif(trim(option_value), '') is not null;

  if coalesce(array_length(clean_options, 1), 0) not between 2 and 6 then
    raise exception 'Add between two and six choices';
  end if;
  if exists (
    select 1
    from unnest(clean_options) option_value
    where char_length(option_value) > 100
  ) then
    raise exception 'Each choice must be 100 characters or fewer';
  end if;
  if (
    select count(*)
    from (select distinct lower(option_value) from unnest(clean_options) option_value) distinct_options
  ) <> array_length(clean_options, 1) then
    raise exception 'Each choice must be different';
  end if;
  if (
    select count(*)
    from public.community_check_ins check_in
    where check_in.creator_id = actor
      and check_in.created_at >= now() - interval '7 days'
  ) >= 3 then
    raise exception 'You can start up to three check-ins each week';
  end if;

  insert into public.community_check_ins (
    community_id,
    creator_id,
    question,
    closes_at
  ) values (
    p_community_id,
    actor,
    clean_question,
    case when p_duration_days is null
      then null
      else now() + make_interval(days => p_duration_days)
    end
  ) returning id into saved;

  foreach option_label in array clean_options loop
    option_position := option_position + 1;
    insert into public.community_check_in_options (
      check_in_id,
      label,
      position
    ) values (
      saved,
      option_label,
      option_position
    );
  end loop;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    actor,
    'community.check_in_created',
    'community_check_in',
    saved,
    jsonb_build_object(
      'community_id', p_community_id,
      'choice_count', array_length(clean_options, 1),
      'duration_days', p_duration_days
    )
  );

  return saved;
end;
$$;

create or replace function public.respond_to_community_check_in(
  p_check_in_id uuid,
  p_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_check_ins%rowtype;
begin
  select * into target
  from public.community_check_ins check_in
  where check_in.id = p_check_in_id;

  if not found
    or target.status <> 'open'
    or (target.closes_at is not null and target.closes_at <= now())
    or not public.communities_enabled()
    or not public.is_active_member(actor)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.user_id = actor
        and membership.status = 'active'
    )
  then
    raise exception 'This check-in is not open';
  end if;
  if not exists (
    select 1
    from public.community_check_in_options option
    where option.check_in_id = target.id
      and option.id = p_option_id
  ) then
    raise exception 'Choose an available answer';
  end if;

  insert into public.community_check_in_responses (
    check_in_id,
    user_id,
    option_id
  ) values (
    target.id,
    actor,
    p_option_id
  )
  on conflict (check_in_id, user_id) do update
  set option_id = excluded.option_id,
      updated_at = now();
end;
$$;

create or replace function public.close_community_check_in(
  p_check_in_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_check_ins%rowtype;
begin
  select * into target
  from public.community_check_ins check_in
  where check_in.id = p_check_in_id
  for update;

  if not found
    or target.status <> 'open'
    or (
      target.creator_id <> actor
      and not public.can_manage_community(target.community_id, actor)
    )
  then
    raise exception 'Only the creator or a Community Host can close this check-in';
  end if;

  update public.community_check_ins
  set status = 'closed',
      closed_at = now(),
      closed_by = actor,
      updated_at = now()
  where id = target.id;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    actor,
    'community.check_in_closed',
    'community_check_in',
    target.id,
    jsonb_build_object('community_id', target.community_id)
  );
end;
$$;

create or replace function public.remove_community_check_in(
  p_check_in_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_check_ins%rowtype;
begin
  select * into target
  from public.community_check_ins check_in
  where check_in.id = p_check_in_id
  for update;

  if not found
    or target.status = 'removed'
    or (
      target.creator_id <> actor
      and not public.can_manage_community(target.community_id, actor)
    )
  then
    raise exception 'Only the creator or a Community Host can remove this check-in';
  end if;

  update public.community_check_ins
  set status = 'removed',
      closed_at = coalesce(closed_at, now()),
      closed_by = actor,
      updated_at = now()
  where id = target.id;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    actor,
    'community.check_in_removed',
    'community_check_in',
    target.id,
    jsonb_build_object('community_id', target.community_id)
  );
end;
$$;

revoke all on function public.list_community_check_ins(uuid, integer) from public;
grant execute on function public.list_community_check_ins(uuid, integer) to authenticated;
revoke all on function public.create_community_check_in(uuid, text, text[], integer) from public;
grant execute on function public.create_community_check_in(uuid, text, text[], integer) to authenticated;
revoke all on function public.respond_to_community_check_in(uuid, uuid) from public;
grant execute on function public.respond_to_community_check_in(uuid, uuid) to authenticated;
revoke all on function public.close_community_check_in(uuid) from public;
grant execute on function public.close_community_check_in(uuid) to authenticated;
revoke all on function public.remove_community_check_in(uuid) from public;
grant execute on function public.remove_community_check_in(uuid) to authenticated;

commit;
