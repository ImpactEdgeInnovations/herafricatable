begin;

alter table public.membership_intake_settings
  add column if not exists trusted_auto_expires_at timestamptz;
alter table public.beta_invites
  add column if not exists source text;

-- If trusted invitation approval was already enabled, applying this migration
-- starts its 60-day sunset rather than leaving an unlimited legacy switch.
update public.membership_intake_settings
set trusted_auto_expires_at = now() + interval '60 days',
    updated_at = now()
where id = true and mode = 'trusted_auto'
  and trusted_auto_expires_at is null;

create or replace function public.get_membership_intake_mode()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when setting.mode = 'trusted_auto'
        and (setting.trusted_auto_expires_at is null
          or setting.trusted_auto_expires_at <= now())
        then 'manual_review'
      else setting.mode
    end
    from public.membership_intake_settings setting where setting.id = true
  ), 'manual_review');
$$;

create or replace function public.get_membership_intake_admin()
returns table (
  mode text, updated_at timestamptz, updated_by_email text,
  pending_applications bigint, trusted_pending_invites bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required'; end if;
  return query
  select public.get_membership_intake_mode(), setting.updated_at,
    account.email::text,
    (select count(*) from public.membership_applications application
      where application.status in ('submitted', 'in_review')),
    (select count(*) from public.beta_invites invite
      where invite.status = 'pending' and invite.intended_role is null
        and (invite.expires_at is null or invite.expires_at > now()))
  from public.membership_intake_settings setting
  left join auth.users account on account.id = setting.updated_by
  where setting.id = true;
end;
$$;

create or replace function public.get_membership_pilot_window()
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare ending timestamptz;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required'; end if;
  select setting.trusted_auto_expires_at into ending
  from public.membership_intake_settings setting where setting.id = true;
  return ending;
end;
$$;
revoke all on function public.get_membership_pilot_window() from public;
grant execute on function public.get_membership_pilot_window() to authenticated;

create or replace function public.set_membership_intake_mode(
  p_mode text, p_reason text
)
returns text language plpgsql security definer set search_path = '' as $$
declare previous_mode text; next_expiry timestamptz;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required'; end if;
  if p_mode is null or p_mode not in ('manual_review', 'trusted_auto', 'closed') then
    raise exception 'Unsupported membership intake mode'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'A clear reason is required'; end if;

  select setting.mode into previous_mode
  from public.membership_intake_settings setting
  where setting.id = true for update;
  next_expiry := case when p_mode = 'trusted_auto'
    then now() + interval '60 days' else null end;
  insert into public.membership_intake_settings
    (id, mode, trusted_auto_expires_at, updated_by, updated_at)
  values (true, p_mode, next_expiry, auth.uid(), now())
  on conflict (id) do update set
    mode = excluded.mode,
    trusted_auto_expires_at = excluded.trusted_auto_expires_at,
    updated_by = excluded.updated_by,
    updated_at = now();
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'membership.intake_mode_changed', 'membership_intake',
    auth.uid(), jsonb_build_object('previous_mode', previous_mode,
      'next_mode', p_mode, 'expires_at', next_expiry,
      'reason', trim(p_reason)));
  return p_mode;
end;
$$;

create or replace function public.invite_pilot_member(
  p_email text, p_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  address text := lower(trim(coalesce(p_email, '')));
  note text := nullif(trim(coalesce(p_note, '')), '');
  ending timestamptz;
  saved uuid;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required'; end if;
  if public.get_membership_intake_mode() <> 'trusted_auto' then
    raise exception 'Turn on the 60-day invited-member setting first'; end if;
  if address !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or char_length(address) > 320 then
    raise exception 'Enter a valid email address'; end if;
  if note is not null and char_length(note) > 600 then
    raise exception 'Keep the personal note under 600 characters'; end if;
  if exists (select 1 from auth.users account
    join public.profiles profile on profile.id = account.id
    where lower(account.email) = address
      and profile.access_status in ('active', 'onboarding', 'dormant', 'suspended', 'deleted')) then
    raise exception 'This email already has member access or a closed account'; end if;
  if exists (select 1 from auth.users account
    join public.membership_applications application on application.user_id = account.id
    where lower(account.email) = address
      and application.status in ('submitted', 'in_review')) then
    raise exception 'This person has already applied. Review her request in Members'; end if;
  update public.beta_invites invite set status = 'expired'
  where invite.email = address and invite.source = 'admin_pilot'
    and invite.status = 'pending' and invite.expires_at <= now();
  if exists (select 1 from public.beta_invites invite
    where invite.email = address and invite.status = 'pending') then
    raise exception 'This email already has an open invitation'; end if;
  select setting.trusted_auto_expires_at into ending
  from public.membership_intake_settings setting where setting.id = true for update;
  if ending is null or ending <= now() then
    raise exception 'The invited-member window has ended'; end if;
  if (select count(*) from public.beta_invites invite
    where invite.source = 'admin_pilot'
      and invite.created_at >= now() - interval '60 days') >= 100 then
    raise exception 'This pilot has reached its 100-invitation limit'; end if;
  insert into public.beta_invites(email, status, invited_by, expires_at, source)
  values (address, 'pending', actor,
    least(now() + interval '30 days', ending), 'admin_pilot')
  returning id into saved;
  insert into public.notification_jobs
    (user_id, template_key, to_email, payload, dedupe_key)
  values (actor, 'pilot_invitation', address,
    jsonb_build_object(
      'title', 'A personal invitation to Her Africa Table',
      'body', coalesce(note,
        'You are invited to meet thoughtful women through Her Africa Table. Verify your email, tell us a little about yourself, then complete your profile. This invitation is valid for up to 30 days.'),
      'href', '/sign-in?mode=apply'),
    'pilot-member-invite:' || saved);
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor, 'membership.pilot_invitation_sent', 'beta_invite', saved,
    jsonb_build_object('email', address, 'expires_at', least(now() + interval '30 days', ending)));
  return saved;
end;
$$;
revoke all on function public.invite_pilot_member(text, text) from public;
grant execute on function public.invite_pilot_member(text, text) to authenticated;

create or replace function public.revoke_pilot_member_invitation(
  p_invite_id uuid, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.beta_invites%rowtype;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Give a short reason for revoking the invitation'; end if;
  select * into target from public.beta_invites
  where id = p_invite_id and source = 'admin_pilot' for update;
  if not found or target.status <> 'pending' then
    raise exception 'This pilot invitation is no longer open'; end if;
  update public.beta_invites set status = 'revoked' where id = target.id;
  update public.notification_jobs job set status = 'suppressed', updated_at = now()
  where job.dedupe_key = 'pilot-member-invite:' || target.id
    and job.status = 'queued';
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'membership.pilot_invitation_revoked', 'beta_invite', target.id,
    jsonb_build_object('reason', trim(p_reason)));
end;
$$;
revoke all on function public.revoke_pilot_member_invitation(uuid, text) from public;
grant execute on function public.revoke_pilot_member_invitation(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
