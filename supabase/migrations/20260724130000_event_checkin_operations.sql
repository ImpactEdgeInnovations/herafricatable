begin;

create table public.event_checkin_credentials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null,
  qr_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  manual_code text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, user_id) references public.event_memberships(event_id, user_id) on delete cascade,
  unique (event_id, user_id),
  unique (event_id, manual_code),
  check (manual_code ~ '^[A-Z0-9]{10}$')
);

create table public.event_checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null,
  credential_id uuid references public.event_checkin_credentials(id) on delete restrict,
  method text not null check (method in ('qr', 'manual')),
  checked_in_by uuid not null references auth.users(id) on delete restrict,
  checked_in_at timestamptz not null default now(),
  device_label text check (device_label is null or char_length(device_label) <= 120),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete restrict,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) between 6 and 500),
  created_at timestamptz not null default now(),
  foreign key (event_id, user_id) references public.event_memberships(event_id, user_id) on delete restrict,
  check ((reversed_at is null and reversed_by is null and reversal_reason is null) or (reversed_at is not null and reversed_by is not null and reversal_reason is not null))
);

create unique index event_checkins_one_active_idx
  on public.event_checkins(event_id, user_id)
  where reversed_at is null;
create index event_checkins_event_time_idx on public.event_checkins(event_id, checked_in_at desc);

create table public.event_checkin_attempts (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('checked_in', 'already_checked_in', 'not_found', 'not_open')),
  method text not null check (method in ('qr', 'manual')),
  attempted_at timestamptz not null default now()
);

create index event_checkin_attempts_staff_rate_idx
  on public.event_checkin_attempts(staff_id, attempted_at desc);
create index event_checkin_attempts_event_idx
  on public.event_checkin_attempts(event_id, attempted_at desc);

alter table public.event_checkin_credentials enable row level security;
alter table public.event_checkins enable row level security;
alter table public.event_checkin_attempts enable row level security;

create policy "Members read own event check-in credentials"
  on public.event_checkin_credentials for select to authenticated
  using (user_id = auth.uid());
create policy "Event managers read scoped check-in credentials"
  on public.event_checkin_credentials for select to authenticated
  using (public.can_manage_event(event_id));

create policy "Members read own event check-ins"
  on public.event_checkins for select to authenticated
  using (user_id = auth.uid());
create policy "Event managers read scoped event check-ins"
  on public.event_checkins for select to authenticated
  using (public.can_manage_event(event_id));

create policy "Event managers read scoped check-in attempts"
  on public.event_checkin_attempts for select to authenticated
  using (public.can_manage_event(event_id));

create or replace function public.get_my_event_pass(p_event_id uuid)
returns table (
  event_id uuid,
  event_slug text,
  event_title text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  venue_name text,
  city text,
  membership_status text,
  qr_payload text,
  manual_code text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  credential public.event_checkin_credentials%rowtype;
  event_end timestamptz;
begin
  if actor is null then raise exception 'Authentication required'; end if;

  select e.ends_at into event_end
  from public.events e
  join public.event_memberships m on m.event_id = e.id and m.user_id = actor
  where e.id = p_event_id and m.status in ('confirmed', 'attended');
  if not found then raise exception 'A confirmed event registration is required'; end if;

  select * into credential
  from public.event_checkin_credentials c
  where c.event_id = p_event_id and c.user_id = actor
  for update;

  if not found then
    insert into public.event_checkin_credentials(event_id, user_id, manual_code, expires_at)
    values (
      p_event_id,
      actor,
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      event_end + interval '1 day'
    )
    returning * into credential;
  elsif credential.revoked_at is not null then
    raise exception 'This event pass has been revoked. Contact event support.';
  end if;

  return query
  select
    e.id,
    e.slug,
    e.title,
    e.starts_at,
    e.ends_at,
    e.timezone,
    v.name,
    v.city,
    m.status,
    'HATCHECKIN:' || e.id::text || ':' || credential.qr_token,
    credential.manual_code,
    ci.checked_in_at
  from public.events e
  join public.event_memberships m on m.event_id = e.id and m.user_id = actor
  left join public.venues v on v.id = e.venue_id
  left join public.event_checkins ci on ci.event_id = e.id and ci.user_id = actor and ci.reversed_at is null
  where e.id = p_event_id;
end;
$$;

create or replace function public.check_in_event_member(
  p_event_id uuid,
  p_credential text,
  p_method text,
  p_device_label text default null
)
returns table (
  outcome text,
  message text,
  checkin_id uuid,
  attendee_name text,
  attendee_email text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  evt public.events%rowtype;
  credential public.event_checkin_credentials%rowtype;
  token text := trim(coalesce(p_credential, ''));
  existing public.event_checkins%rowtype;
  saved public.event_checkins%rowtype;
  member_name text;
  member_email text;
  recent_attempts integer;
begin
  if actor is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorized'; end if;
  if p_method not in ('qr', 'manual') then raise exception 'Unsupported check-in method'; end if;
  if char_length(token) > 180 then raise exception 'Invalid credential'; end if;

  select count(*) into recent_attempts
  from public.event_checkin_attempts
  where staff_id = actor and attempted_at > now() - interval '15 minutes';
  if recent_attempts >= 200 then raise exception 'Check-in rate limit reached. Wait before trying again.'; end if;

  select * into evt from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;

  if now() < evt.starts_at - interval '8 hours' or now() > evt.ends_at + interval '12 hours' then
    insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
    values (p_event_id, actor, 'not_open', p_method);
    return query select 'not_open'::text, 'Check-in is not open for this event.'::text, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  if p_method = 'qr' then
    if token like 'HATCHECKIN:%:%' then token := split_part(token, ':', 3); end if;
    select * into credential from public.event_checkin_credentials c
    where c.event_id = p_event_id and c.qr_token = token and c.revoked_at is null and c.expires_at >= now();
  else
    select * into credential from public.event_checkin_credentials c
    where c.event_id = p_event_id and c.manual_code = upper(token) and c.revoked_at is null and c.expires_at >= now();
  end if;

  if not found or not exists (
    select 1 from public.event_memberships m
    where m.event_id = p_event_id and m.user_id = credential.user_id and m.status in ('confirmed', 'attended')
  ) then
    insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
    values (p_event_id, actor, 'not_found', p_method);
    return query select 'not_found'::text, 'Pass not recognized for this event.'::text, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  select * into existing from public.event_checkins c
  where c.event_id = p_event_id and c.user_id = credential.user_id and c.reversed_at is null;

  select coalesce(nullif(trim(p.display_name), ''), split_part(u.email::text, '@', 1)), u.email::text
  into member_name, member_email
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = credential.user_id;

  if found and existing.id is not null then
    insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
    values (p_event_id, actor, 'already_checked_in', p_method);
    return query select 'already_checked_in'::text, 'Already checked in.'::text, existing.id, member_name, member_email, existing.checked_in_at;
    return;
  end if;

  insert into public.event_checkins(event_id, user_id, credential_id, method, checked_in_by, device_label)
  values (p_event_id, credential.user_id, credential.id, p_method, actor, nullif(trim(p_device_label), ''))
  on conflict (event_id, user_id) where reversed_at is null do nothing
  returning * into saved;

  if saved.id is null then
    select * into saved from public.event_checkins c
    where c.event_id = p_event_id and c.user_id = credential.user_id and c.reversed_at is null;
    insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
    values (p_event_id, actor, 'already_checked_in', p_method);
    return query select 'already_checked_in'::text, 'Already checked in.'::text, saved.id, member_name, member_email, saved.checked_in_at;
    return;
  end if;

  update public.event_memberships set status = 'attended', updated_at = now()
  where event_id = p_event_id and user_id = credential.user_id;
  insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
  values (p_event_id, actor, 'checked_in', p_method);
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor, 'event.check_in', 'event_checkin', saved.id, jsonb_build_object('event_id', p_event_id, 'user_id', credential.user_id, 'method', p_method));

  return query select 'checked_in'::text, 'Check-in confirmed.'::text, saved.id, member_name, member_email, saved.checked_in_at;
end;
$$;

create or replace function public.reverse_event_checkin(p_checkin_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.event_checkins%rowtype;
begin
  select * into target from public.event_checkins where id = p_checkin_id for update;
  if not found or actor is null or not public.can_manage_event(target.event_id) then raise exception 'Not authorized'; end if;
  if target.reversed_at is not null then raise exception 'Check-in is already reversed'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 6 then raise exception 'A reversal reason of at least 6 characters is required'; end if;

  update public.event_checkins
  set reversed_at = now(), reversed_by = actor, reversal_reason = trim(p_reason)
  where id = p_checkin_id;
  update public.event_memberships set status = 'confirmed', updated_at = now()
  where event_id = target.event_id and user_id = target.user_id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor, 'event.check_in_reversed', 'event_checkin', target.id, jsonb_build_object('event_id', target.event_id, 'user_id', target.user_id, 'reason', trim(p_reason)));
end;
$$;

create or replace function public.list_event_checkins(p_event_id uuid)
returns table (
  checkin_id uuid,
  user_id uuid,
  attendee_name text,
  attendee_email text,
  membership_status text,
  ticket_name text,
  order_reference text,
  method text,
  checked_in_at timestamptz,
  checked_in_by_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorized'; end if;
  return query
  select
    ci.id,
    m.user_id,
    coalesce(nullif(trim(p.display_name), ''), split_part(member.email::text, '@', 1)),
    member.email::text,
    m.status,
    t.name,
    o.reference,
    ci.method,
    ci.checked_in_at,
    staff.email::text
  from public.event_memberships m
  join auth.users member on member.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  left join public.ticket_types t on t.id = m.ticket_type_id
  left join public.orders o on o.id = m.order_id
  left join public.event_checkins ci on ci.event_id = m.event_id and ci.user_id = m.user_id and ci.reversed_at is null
  left join auth.users staff on staff.id = ci.checked_in_by
  where m.event_id = p_event_id and m.status in ('confirmed', 'attended')
  order by ci.checked_in_at desc nulls last, coalesce(nullif(trim(p.display_name), ''), split_part(member.email::text, '@', 1));
end;
$$;

revoke all on function public.get_my_event_pass(uuid) from public;
grant execute on function public.get_my_event_pass(uuid) to authenticated;
revoke all on function public.check_in_event_member(uuid, text, text, text) from public;
grant execute on function public.check_in_event_member(uuid, text, text, text) to authenticated;
revoke all on function public.reverse_event_checkin(uuid, text) from public;
grant execute on function public.reverse_event_checkin(uuid, text) to authenticated;
revoke all on function public.list_event_checkins(uuid) from public;
grant execute on function public.list_event_checkins(uuid) to authenticated;

alter publication supabase_realtime add table public.event_checkins;

comment on table public.event_checkin_credentials is 'Private per-member credentials for scoped event entry. QR tokens must never appear in logs or audit metadata.';
comment on table public.event_checkins is 'Immutable attendance ledger; corrections are recorded as reversals rather than destructive deletes.';
comment on function public.check_in_event_member is 'Rate-limited, event-scoped door operation with duplicate protection and manual fallback.';

commit;
