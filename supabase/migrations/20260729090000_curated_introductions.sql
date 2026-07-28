begin;

create table public.curated_introductions (
  id uuid primary key default gen_random_uuid(),
  member_low uuid not null references auth.users(id) on delete cascade,
  member_high uuid not null references auth.users(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 20 and 1000),
  member_low_decision text not null default 'pending'
    check (member_low_decision in ('pending', 'accepted', 'declined')),
  member_high_decision text not null default 'pending'
    check (member_high_decision in ('pending', 'accepted', 'declined')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  member_low_responded_at timestamptz,
  member_high_responded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curated_introduction_distinct_members
    check (member_low <> member_high),
  constraint curated_introduction_canonical_pair
    check (member_low < member_high)
);

create unique index curated_introductions_one_pending_pair_idx
  on public.curated_introductions (member_low, member_high)
  where status = 'pending';
create index curated_introductions_member_low_idx
  on public.curated_introductions (member_low, status, updated_at desc);
create index curated_introductions_member_high_idx
  on public.curated_introductions (member_high, status, updated_at desc);

alter table public.curated_introductions enable row level security;
create policy "Members read own curated introductions"
  on public.curated_introductions
  for select
  to authenticated
  using (auth.uid() in (member_low, member_high));

create or replace function public.create_curated_introduction(
  p_member_a uuid,
  p_member_b uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  low_id uuid;
  high_id uuid;
  saved uuid;
  clean_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_member_a is null
    or p_member_b is null
    or p_member_a = p_member_b
    or not public.is_active_member(p_member_a)
    or not public.is_active_member(p_member_b)
  then
    raise exception 'Choose two active visible members';
  end if;
  if char_length(clean_reason) not between 20 and 1000 then
    raise exception 'Record a clear introduction reason';
  end if;
  if public.is_blocked_pair(p_member_a, p_member_b) then
    raise exception 'These members are not available for an introduction';
  end if;

  low_id := least(p_member_a, p_member_b);
  high_id := greatest(p_member_a, p_member_b);
  if exists (
    select 1
    from public.connections
    where user_low = low_id
      and user_high = high_id
      and status in ('pending', 'accepted')
  ) then
    raise exception 'A connection journey already exists';
  end if;

  insert into public.curated_introductions (
    member_low,
    member_high,
    proposed_by,
    reason
  )
  values (low_id, high_id, actor, clean_reason)
  returning id into saved;

  perform public.enqueue_notification(
    low_id,
    'network',
    'A thoughtful introduction',
    'Her Africa Table has suggested a member you may value meeting. You remain in control of whether to accept.',
    '/network#curated-introductions',
    'curated-introduction:' || saved
  );
  perform public.enqueue_notification(
    high_id,
    'network',
    'A thoughtful introduction',
    'Her Africa Table has suggested a member you may value meeting. You remain in control of whether to accept.',
    '/network#curated-introductions',
    'curated-introduction:' || saved
  );
  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'curated_introduction.created',
    'curated_introduction',
    saved,
    jsonb_build_object('member_low', low_id, 'member_high', high_id)
  );
  return saved;
exception
  when unique_violation then
    raise exception 'A curated introduction is already awaiting consent';
end;
$$;

create or replace function public.respond_to_curated_introduction(
  p_introduction_id uuid,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.curated_introductions%rowtype;
  next_low text;
  next_high text;
  next_status text;
  saved_connection uuid;
begin
  if p_action not in ('accept', 'decline') then
    raise exception 'Unsupported introduction action';
  end if;
  select *
  into target
  from public.curated_introductions
  where id = p_introduction_id
    and actor in (member_low, member_high)
    and status = 'pending'
  for update;
  if not found or not public.is_active_member(actor) then
    raise exception 'Pending introduction not found';
  end if;
  if public.is_blocked_pair(target.member_low, target.member_high) then
    update public.curated_introductions
    set status = 'cancelled', completed_at = now(), updated_at = now()
    where id = target.id;
    raise exception 'This introduction is no longer available';
  end if;

  next_low := case
    when actor = target.member_low
    then case when p_action = 'accept' then 'accepted' else 'declined' end
    else target.member_low_decision
  end;
  next_high := case
    when actor = target.member_high
    then case when p_action = 'accept' then 'accepted' else 'declined' end
    else target.member_high_decision
  end;
  next_status := case
    when 'declined' in (next_low, next_high) then 'declined'
    when next_low = 'accepted' and next_high = 'accepted' then 'accepted'
    else 'pending'
  end;

  update public.curated_introductions
  set member_low_decision = next_low,
      member_high_decision = next_high,
      member_low_responded_at = case
        when actor = member_low then now() else member_low_responded_at
      end,
      member_high_responded_at = case
        when actor = member_high then now() else member_high_responded_at
      end,
      status = next_status,
      completed_at = case when next_status <> 'pending' then now() end,
      updated_at = now()
  where id = target.id;

  if next_status = 'accepted' then
    insert into public.connections (
      user_low,
      user_high,
      requester_id,
      recipient_id,
      status,
      introduction_note,
      responded_at
    )
    values (
      target.member_low,
      target.member_high,
      target.member_low,
      target.member_high,
      'accepted',
      target.reason,
      now()
    )
    on conflict (user_low, user_high) do update
    set requester_id = excluded.requester_id,
        recipient_id = excluded.recipient_id,
        status = 'accepted',
        introduction_note = excluded.introduction_note,
        responded_at = now(),
        updated_at = now()
    where connections.status in ('ignored', 'cancelled')
    returning id into saved_connection;
    if saved_connection is null then
      raise exception 'A connection journey already exists';
    end if;
    perform public.enqueue_notification(
      target.member_low,
      'network',
      'Your introduction is ready',
      'You both accepted. Private messaging is now open.',
      '/network',
      'curated-introduction-ready:' || target.id || ':' || target.member_low
    );
    perform public.enqueue_notification(
      target.member_high,
      'network',
      'Your introduction is ready',
      'You both accepted. Private messaging is now open.',
      '/network',
      'curated-introduction-ready:' || target.id || ':' || target.member_high
    );
  elsif next_status = 'declined' then
    perform public.enqueue_notification(
      case
        when actor = target.member_low then target.member_high
        else target.member_low
      end,
      'network',
      'Introduction update',
      'This suggested introduction will not move forward. No private contact details were shared.',
      '/network',
      'curated-introduction-closed:' || target.id
    );
  end if;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'curated_introduction.' || p_action,
    'curated_introduction',
    target.id,
    jsonb_build_object('resulting_status', next_status)
  );
  return next_status;
end;
$$;

create or replace function public.cancel_curated_introduction(
  p_introduction_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  update public.curated_introductions
  set status = 'cancelled', completed_at = now(), updated_at = now()
  where id = p_introduction_id and status = 'pending';
  if not found then
    raise exception 'Pending introduction not found';
  end if;
  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id
  )
  values (
    actor,
    'curated_introduction.cancelled',
    'curated_introduction',
    p_introduction_id
  );
end;
$$;

create or replace function public.list_my_curated_introductions()
returns table (
  introduction_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  city text,
  country text,
  reason text,
  my_decision text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active visible membership required';
  end if;
  return query
  select
    introduction.id,
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.job_title,
    profile.company,
    profile.city,
    profile.country,
    introduction.reason,
    case
      when introduction.member_low = auth.uid()
      then introduction.member_low_decision
      else introduction.member_high_decision
    end,
    introduction.status,
    introduction.created_at,
    introduction.updated_at
  from public.curated_introductions introduction
  join public.profiles profile
    on profile.id = case
      when introduction.member_low = auth.uid()
      then introduction.member_high
      else introduction.member_low
    end
  where auth.uid() in (introduction.member_low, introduction.member_high)
    and introduction.created_at > now() - interval '180 days'
  order by case introduction.status when 'pending' then 0 else 1 end,
    introduction.updated_at desc;
end;
$$;

create or replace function public.list_curated_introductions_admin()
returns table (
  introduction_id uuid,
  member_low uuid,
  member_low_name text,
  member_low_email text,
  member_low_decision text,
  member_high uuid,
  member_high_name text,
  member_high_email text,
  member_high_decision text,
  reason text,
  status text,
  proposed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  return query
  select
    introduction.id,
    introduction.member_low,
    low_profile.display_name,
    low_user.email::text,
    introduction.member_low_decision,
    introduction.member_high,
    high_profile.display_name,
    high_user.email::text,
    introduction.member_high_decision,
    introduction.reason,
    introduction.status,
    introduction.proposed_by,
    introduction.created_at,
    introduction.updated_at
  from public.curated_introductions introduction
  join auth.users low_user on low_user.id = introduction.member_low
  join auth.users high_user on high_user.id = introduction.member_high
  left join public.profiles low_profile on low_profile.id = introduction.member_low
  left join public.profiles high_profile on high_profile.id = introduction.member_high
  order by case introduction.status when 'pending' then 0 else 1 end,
    introduction.updated_at desc
  limit 250;
end;
$$;

revoke all on function public.create_curated_introduction(uuid, uuid, text) from public;
grant execute on function public.create_curated_introduction(uuid, uuid, text) to authenticated;
revoke all on function public.respond_to_curated_introduction(uuid, text) from public;
grant execute on function public.respond_to_curated_introduction(uuid, text) to authenticated;
revoke all on function public.cancel_curated_introduction(uuid) from public;
grant execute on function public.cancel_curated_introduction(uuid) to authenticated;
revoke all on function public.list_my_curated_introductions() from public;
grant execute on function public.list_my_curated_introductions() to authenticated;
revoke all on function public.list_curated_introductions_admin() from public;
grant execute on function public.list_curated_introductions_admin() to authenticated;

commit;
