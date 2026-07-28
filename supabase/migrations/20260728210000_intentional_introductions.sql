begin;

alter table public.connections
  add column if not exists introduction_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'connections_introduction_note_length'
      and conrelid = 'public.connections'::regclass
  ) then
    alter table public.connections
      add constraint connections_introduction_note_length
      check (
        introduction_note is null
        or char_length(introduction_note) between 10 and 500
      );
  end if;
end;
$$;

create or replace function public.request_connection_with_context(
  p_member_id uuid,
  p_connection_code text default null,
  p_introduction_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target uuid := p_member_id;
  low_id uuid;
  high_id uuid;
  saved uuid;
  existing_status text;
  clean_note text := nullif(trim(coalesce(p_introduction_note, '')), '');
begin
  if not public.is_active_member(actor) then
    raise exception 'Active visible membership required';
  end if;
  if clean_note is not null and char_length(clean_note) not between 10 and 500 then
    raise exception 'An introduction must be between 10 and 500 characters';
  end if;
  if (
    select count(*)
    from public.connections
    where requester_id = actor
      and created_at > now() - interval '24 hours'
  ) >= 30 then
    raise exception 'Daily connection request limit reached';
  end if;
  if target is null and nullif(trim(p_connection_code), '') is not null then
    select user_id
    into target
    from public.member_connection_codes
    where code = upper(trim(p_connection_code));
  end if;
  if target is null
    or target = actor
    or not public.is_active_member(target)
    or public.is_blocked_pair(actor, target)
  then
    raise exception 'Member is unavailable';
  end if;

  low_id := least(actor, target);
  high_id := greatest(actor, target);
  select status
  into existing_status
  from public.connections
  where user_low = low_id and user_high = high_id;

  if existing_status in ('pending', 'accepted') then
    raise exception 'A connection already exists with this member';
  end if;

  insert into public.connections (
    user_low,
    user_high,
    requester_id,
    recipient_id,
    status,
    introduction_note
  )
  values (
    low_id,
    high_id,
    actor,
    target,
    'pending',
    clean_note
  )
  on conflict (user_low, user_high) do update
  set requester_id = excluded.requester_id,
      recipient_id = excluded.recipient_id,
      status = 'pending',
      introduction_note = excluded.introduction_note,
      responded_at = null,
      updated_at = now()
  where connections.status in ('ignored', 'cancelled')
  returning id into saved;

  if saved is null then
    raise exception 'A connection already exists with this member';
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
    'connection.requested',
    'connection',
    saved,
    jsonb_build_object(
      'recipient_id', target,
      'introduction_provided', clean_note is not null
    )
  );
  return saved;
end;
$$;

create or replace function public.list_my_network_with_context()
returns table (
  connection_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  city text,
  country text,
  status text,
  direction text,
  introduction_note text,
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
    connection.id,
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.job_title,
    profile.company,
    profile.city,
    profile.country,
    connection.status,
    case
      when connection.requester_id = auth.uid() then 'outgoing'
      else 'incoming'
    end,
    connection.introduction_note,
    connection.updated_at
  from public.connections connection
  join public.profiles profile
    on profile.id = case
      when connection.user_low = auth.uid() then connection.user_high
      else connection.user_low
    end
  where auth.uid() in (connection.user_low, connection.user_high)
    and connection.status in ('pending', 'accepted')
    and profile.access_status = 'active'
    and not profile.visibility_paused
    and not public.is_blocked_pair(auth.uid(), profile.id)
  order by connection.updated_at desc;
end;
$$;

create or replace function public.get_connection_introduction(p_member_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  saved_note text;
begin
  if not public.is_active_member(auth.uid())
    or not public.is_active_member(p_member_id)
    or public.is_blocked_pair(auth.uid(), p_member_id)
  then
    raise exception 'Member is unavailable';
  end if;

  select introduction_note
  into saved_note
  from public.connections
  where user_low = least(auth.uid(), p_member_id)
    and user_high = greatest(auth.uid(), p_member_id)
    and auth.uid() in (user_low, user_high)
    and status in ('pending', 'accepted');

  return saved_note;
end;
$$;

revoke all on function public.request_connection_with_context(uuid, text, text) from public;
grant execute on function public.request_connection_with_context(uuid, text, text) to authenticated;
revoke all on function public.list_my_network_with_context() from public;
grant execute on function public.list_my_network_with_context() to authenticated;
revoke all on function public.get_connection_introduction(uuid) from public;
grant execute on function public.get_connection_introduction(uuid) to authenticated;

commit;
