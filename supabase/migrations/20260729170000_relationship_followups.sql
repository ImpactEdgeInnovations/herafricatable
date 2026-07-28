begin;

create table public.connection_followups (
  owner_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  private_note text,
  next_step text,
  remind_on date,
  last_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, connection_id),
  constraint connection_followup_note_length check (
    private_note is null or char_length(private_note) between 3 and 1000
  ),
  constraint connection_followup_next_step_length check (
    next_step is null or char_length(next_step) between 3 and 300
  ),
  constraint connection_followup_has_content check (
    private_note is not null or next_step is not null
  )
);

create index connection_followups_due_idx
  on public.connection_followups (owner_id, remind_on)
  where remind_on is not null and next_step is not null;

alter table public.connection_followups enable row level security;
create policy "Members read own connection followups"
  on public.connection_followups
  for select
  to authenticated
  using (owner_id = auth.uid());

create or replace function public.save_connection_followup(
  p_connection_id uuid,
  p_private_note text default null,
  p_next_step text default null,
  p_remind_on date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_note text := nullif(trim(coalesce(p_private_note, '')), '');
  clean_next_step text := nullif(trim(coalesce(p_next_step, '')), '');
begin
  if not public.is_active_member(actor)
    or not exists (
      select 1
      from public.connections connection
      where connection.id = p_connection_id
        and actor in (connection.user_low, connection.user_high)
        and connection.status = 'accepted'
    )
  then
    raise exception 'Accepted connection required';
  end if;
  if clean_note is null and clean_next_step is null then
    raise exception 'Add a private note or next step';
  end if;
  if clean_note is not null and char_length(clean_note) not between 3 and 1000 then
    raise exception 'Private note must be between 3 and 1000 characters';
  end if;
  if clean_next_step is not null
    and char_length(clean_next_step) not between 3 and 300
  then
    raise exception 'Next step must be between 3 and 300 characters';
  end if;
  if p_remind_on is not null and clean_next_step is null then
    raise exception 'A reminder requires a next step';
  end if;
  if p_remind_on is not null
    and (
      p_remind_on < current_date
      or p_remind_on > current_date + 730
    )
  then
    raise exception 'Choose a reminder within the next two years';
  end if;

  insert into public.connection_followups (
    owner_id,
    connection_id,
    private_note,
    next_step,
    remind_on
  )
  values (
    actor,
    p_connection_id,
    clean_note,
    clean_next_step,
    p_remind_on
  )
  on conflict (owner_id, connection_id) do update
  set private_note = excluded.private_note,
      next_step = excluded.next_step,
      remind_on = excluded.remind_on,
      updated_at = now();

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'connection.followup_saved',
    'connection',
    p_connection_id,
    jsonb_build_object(
      'has_private_note', clean_note is not null,
      'has_next_step', clean_next_step is not null,
      'has_reminder', p_remind_on is not null
    )
  );
end;
$$;

create or replace function public.complete_connection_followup(
  p_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  update public.connection_followups
  set next_step = null,
      remind_on = null,
      last_completed_at = now(),
      updated_at = now()
  where owner_id = actor
    and connection_id = p_connection_id
    and next_step is not null
    and private_note is not null;
  if not found then
    delete from public.connection_followups
    where owner_id = actor
      and connection_id = p_connection_id
      and next_step is not null;
  end if;
  if not found then
    raise exception 'Active follow-up not found';
  end if;
  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id
  )
  values (
    actor,
    'connection.followup_completed',
    'connection',
    p_connection_id
  );
end;
$$;

create or replace function public.remove_connection_followup(
  p_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  delete from public.connection_followups
  where owner_id = actor and connection_id = p_connection_id;
  if not found then
    raise exception 'Follow-up plan not found';
  end if;
  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id
  )
  values (
    actor,
    'connection.followup_removed',
    'connection',
    p_connection_id
  );
end;
$$;

create or replace function public.list_my_connection_followups()
returns table (
  connection_id uuid,
  other_user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  private_note text,
  next_step text,
  remind_on date,
  is_due boolean,
  last_completed_at timestamptz,
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
    followup.connection_id,
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.job_title,
    profile.company,
    followup.private_note,
    followup.next_step,
    followup.remind_on,
    followup.remind_on is not null
      and followup.remind_on <= current_date,
    followup.last_completed_at,
    followup.updated_at
  from public.connection_followups followup
  join public.connections connection
    on connection.id = followup.connection_id
    and connection.status = 'accepted'
  join public.profiles profile
    on profile.id = case
      when connection.user_low = auth.uid()
      then connection.user_high
      else connection.user_low
    end
  where followup.owner_id = auth.uid()
    and auth.uid() in (connection.user_low, connection.user_high)
    and profile.access_status = 'active'
    and not profile.visibility_paused
    and not public.is_blocked_pair(auth.uid(), profile.id)
  order by followup.remind_on asc nulls last, followup.updated_at desc;
end;
$$;

create or replace function public.list_due_connection_followups(
  p_limit integer default 3
)
returns table (
  connection_id uuid,
  display_name text,
  next_step text,
  remind_on date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    followup.connection_id,
    profile.display_name,
    followup.next_step,
    followup.remind_on
  from public.connection_followups followup
  join public.connections connection
    on connection.id = followup.connection_id
    and connection.status = 'accepted'
  join public.profiles profile
    on profile.id = case
      when connection.user_low = auth.uid()
      then connection.user_high
      else connection.user_low
    end
  where followup.owner_id = auth.uid()
    and auth.uid() in (connection.user_low, connection.user_high)
    and followup.next_step is not null
    and followup.remind_on <= current_date
    and profile.access_status = 'active'
    and not profile.visibility_paused
    and not public.is_blocked_pair(auth.uid(), profile.id)
  order by followup.remind_on, followup.updated_at
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
end;
$$;

revoke all on function public.save_connection_followup(uuid, text, text, date) from public;
grant execute on function public.save_connection_followup(uuid, text, text, date) to authenticated;
revoke all on function public.complete_connection_followup(uuid) from public;
grant execute on function public.complete_connection_followup(uuid) to authenticated;
revoke all on function public.remove_connection_followup(uuid) from public;
grant execute on function public.remove_connection_followup(uuid) to authenticated;
revoke all on function public.list_my_connection_followups() from public;
grant execute on function public.list_my_connection_followups() to authenticated;
revoke all on function public.list_due_connection_followups(integer) from public;
grant execute on function public.list_due_connection_followups(integer) to authenticated;

commit;
