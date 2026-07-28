begin;

create table if not exists public.member_saved_profiles (
  saver_id uuid not null references auth.users(id) on delete cascade,
  saved_user_id uuid not null references auth.users(id) on delete cascade,
  private_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (saver_id, saved_user_id),
  constraint saved_profile_distinct_members check (saver_id <> saved_user_id),
  constraint saved_profile_note_length check (
    private_note is null or char_length(private_note) between 3 and 500
  )
);

create index if not exists member_saved_profiles_saved_user_idx
  on public.member_saved_profiles (saved_user_id, created_at desc);

alter table public.member_saved_profiles enable row level security;

drop policy if exists "Members read own saved profiles"
  on public.member_saved_profiles;
create policy "Members read own saved profiles"
  on public.member_saved_profiles
  for select
  to authenticated
  using (saver_id = auth.uid());

create or replace function public.save_member_profile(
  p_member_id uuid,
  p_private_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_note text := nullif(trim(coalesce(p_private_note, '')), '');
begin
  if not public.is_active_member(actor)
    or actor = p_member_id
    or not public.is_active_member(p_member_id)
    or public.is_blocked_pair(actor, p_member_id)
  then
    raise exception 'Member is unavailable';
  end if;
  if clean_note is not null and char_length(clean_note) not between 3 and 500 then
    raise exception 'A private note must be between 3 and 500 characters';
  end if;
  if not exists (
    select 1
    from public.member_saved_profiles
    where saver_id = actor and saved_user_id = p_member_id
  ) and (
    select count(*)
    from public.member_saved_profiles
    where saver_id = actor
  ) >= 100 then
    raise exception 'Saved profile limit reached';
  end if;

  insert into public.member_saved_profiles (
    saver_id,
    saved_user_id,
    private_note
  )
  values (actor, p_member_id, clean_note)
  on conflict (saver_id, saved_user_id) do update
  set private_note = excluded.private_note,
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
    'member_profile.saved',
    'profile',
    p_member_id,
    jsonb_build_object('private_note_provided', clean_note is not null)
  );
end;
$$;

create or replace function public.remove_saved_member_profile(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  delete from public.member_saved_profiles
  where saver_id = actor and saved_user_id = p_member_id;
  if not found then
    raise exception 'Saved profile not found';
  end if;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id
  )
  values (actor, 'member_profile.unsaved', 'profile', p_member_id);
end;
$$;

create or replace function public.is_member_profile_saved(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_saved_profiles
    where saver_id = auth.uid() and saved_user_id = p_member_id
  );
$$;

create or replace function public.list_my_saved_profiles()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  city text,
  country text,
  private_note text,
  connection_status text,
  saved_at timestamptz
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
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.job_title,
    profile.company,
    profile.city,
    profile.country,
    saved.private_note,
    connection.status,
    saved.created_at
  from public.member_saved_profiles saved
  join public.profiles profile on profile.id = saved.saved_user_id
  left join public.connections connection
    on connection.user_low = least(auth.uid(), profile.id)
    and connection.user_high = greatest(auth.uid(), profile.id)
  where saved.saver_id = auth.uid()
    and profile.access_status = 'active'
    and not profile.visibility_paused
    and not public.is_blocked_pair(auth.uid(), profile.id)
  order by saved.updated_at desc;
end;
$$;

revoke all on function public.save_member_profile(uuid, text) from public;
grant execute on function public.save_member_profile(uuid, text) to authenticated;
revoke all on function public.remove_saved_member_profile(uuid) from public;
grant execute on function public.remove_saved_member_profile(uuid) to authenticated;
revoke all on function public.is_member_profile_saved(uuid) from public;
grant execute on function public.is_member_profile_saved(uuid) to authenticated;
revoke all on function public.list_my_saved_profiles() from public;
grant execute on function public.list_my_saved_profiles() to authenticated;

commit;
