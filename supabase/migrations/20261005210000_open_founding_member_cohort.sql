begin;

-- The first 20 active, non-staff members form the founding pilot. Fill seats
-- held by members who were already active before opening them to newcomers.
do $$
begin
  perform 1 from public.community_pilot_settings where id = true for update;
  insert into public.community_pilot_access(user_id, source)
  select profile.id, 'existing_tester'
  from public.profiles profile
  where profile.access_status = 'active'
    and not exists (
      select 1 from public.user_roles role
      where role.user_id = profile.id
        and role.role in ('super_admin', 'event_staff', 'moderator')
    )
    and not exists (
      select 1 from public.community_pilot_access access
      where access.user_id = profile.id
    )
  order by profile.created_at, profile.id
  limit greatest(0, 20 - (select count(*) from public.community_pilot_access))
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.assign_founding_community_pilot_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.access_status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.access_status = 'active' then return new; end if;
  if exists (
    select 1 from public.user_roles role
    where role.user_id = new.id
      and role.role in ('super_admin', 'event_staff', 'moderator')
  ) then return new; end if;
  if public.get_membership_intake_mode() <> 'trusted_auto' then return new; end if;
  perform 1 from public.community_pilot_settings setting
    where setting.id = true and setting.enabled for update;
  if not found then return new; end if;
  if (select count(*) from public.community_pilot_access) < 20 then
    insert into public.community_pilot_access(user_id, source)
    values (new.id, 'member_activation') on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.founding_pilot_member_ready(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is not null
    and (p_user_id = auth.uid() or public.is_admin(array['super_admin']::public.app_role[]))
    and public.get_membership_intake_mode() = 'trusted_auto'
    and public.is_active_member(p_user_id)
    and exists (
      select 1 from public.community_pilot_access access
      where access.user_id = p_user_id
    );
$$;

-- During the existing 60-day window anyone with a verified email may apply.
-- The cohort cap limits automatic Host privileges, not ordinary membership.
create or replace function public.submit_membership_application(
  p_display_name text, p_city text, p_country text,
  p_professional_focus text, p_reason text, p_referral_source text,
  p_referred_by text, p_acknowledged boolean
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  member_status public.member_access_status;
  intake_mode text := 'manual_review';
  email_value text;
  trusted_invite public.beta_invites%rowtype;
  auto_approved boolean := false;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_acknowledged is not true then
    raise exception 'Please confirm the membership expectations before submitting';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 2 and 120 then
    raise exception 'Enter your full name';
  end if;
  if char_length(trim(coalesce(p_city, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_country, ''))) not between 2 and 120 then
    raise exception 'Enter your city and country';
  end if;
  if char_length(trim(coalesce(p_professional_focus, ''))) not between 2 and 180 then
    raise exception 'Tell us about your work or current focus';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 20 and 1200 then
    raise exception 'Tell us a little more about what brings you to the table';
  end if;
  if char_length(trim(coalesce(p_referral_source, ''))) not between 2 and 120 then
    raise exception 'Tell us how you heard about Her Africa Table';
  end if;

  select profile.access_status, lower(account.email)
  into member_status, email_value
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where profile.id = actor
  for update of profile;
  if not found then raise exception 'Member profile not found'; end if;
  if member_status <> 'pending' then
    raise exception 'Your membership request no longer needs an application';
  end if;

  select public.get_membership_intake_mode() into intake_mode;
  if intake_mode = 'closed' then
    raise exception 'New membership requests are temporarily paused';
  end if;
  if intake_mode = 'trusted_auto' then
    select * into trusted_invite
    from public.beta_invites invite
    where lower(invite.email) = email_value
      and invite.intended_role is null
      and (
        (invite.status = 'pending'
          and (invite.expires_at is null or invite.expires_at > now()))
        or (invite.status = 'accepted' and invite.accepted_by = actor)
      )
    order by invite.created_at desc
    limit 1 for update;
    auto_approved := true;
  end if;

  insert into public.membership_applications (
    user_id, display_name, city, country, professional_focus, reason,
    referral_source, referred_by, status, consent_at, submitted_at,
    reviewed_at, reviewed_by, review_note, updated_at
  ) values (
    actor, trim(p_display_name), trim(p_city), trim(p_country),
    trim(p_professional_focus), trim(p_reason), trim(p_referral_source),
    nullif(trim(coalesce(p_referred_by, '')), ''),
    case when auto_approved then 'approved' else 'submitted' end,
    now(), now(),
    case when auto_approved then now() else null end,
    null,
    case when auto_approved then 'Automatically approved during the 60-day open pilot' else null end,
    now()
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    city = excluded.city,
    country = excluded.country,
    professional_focus = excluded.professional_focus,
    reason = excluded.reason,
    referral_source = excluded.referral_source,
    referred_by = excluded.referred_by,
    status = excluded.status,
    consent_at = now(),
    submitted_at = now(),
    reviewed_at = excluded.reviewed_at,
    reviewed_by = null,
    review_note = excluded.review_note,
    updated_at = now();

  if auto_approved and trusted_invite.id is not null
    and trusted_invite.status = 'pending' then
    update public.beta_invites
    set status = 'accepted', accepted_by = actor, accepted_at = now()
    where id = trusted_invite.id;
  end if;

  update public.profiles
  set display_name = trim(p_display_name), city = trim(p_city),
      country = trim(p_country),
      access_status = case when auto_approved
        then 'onboarding'::public.member_access_status
        else access_status end,
      updated_at = now()
  where id = actor;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor,
    case when auto_approved then 'membership.application_auto_approved'
      else 'membership.application_submitted' end,
    'membership_application', actor,
    jsonb_build_object('mode', intake_mode,
      'trusted_invite', trusted_invite.id is not null,
      'open_pilot', intake_mode = 'trusted_auto')
  );
  return case when auto_approved then 'approved' else 'submitted' end;
end;
$$;

create or replace function public.get_pilot_free_event_setting()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.get_membership_intake_mode() = 'trusted_auto'
    and coalesce((select setting.auto_publish_free_events
      from public.invited_pilot_event_settings setting where setting.id = true), false)
    and (public.is_admin(array['super_admin']::public.app_role[])
      or public.founding_pilot_member_ready());
$$;

create or replace function public.get_invited_pilot_event_setting()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.get_membership_intake_mode() = 'trusted_auto'
    and coalesce((select setting.auto_private_drafts
      from public.invited_pilot_event_settings setting where setting.id = true), false)
    and (public.is_admin(array['super_admin']::public.app_role[])
      or public.founding_pilot_member_ready());
$$;

create or replace function public.create_invited_pilot_event_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_venue uuid;
  saved_event uuid;
  saved_slug text;
begin
  if new.status <> 'submitted'
    or (tg_op = 'UPDATE' and old.status = 'submitted') then return new; end if;
  if actor is null or actor <> new.proposed_by
    or not public.founding_pilot_member_ready(actor) then return new; end if;
  if public.get_pilot_free_event_setting() then
    perform public.publish_pilot_free_event(new.id);
    return new;
  end if;
  if not public.get_invited_pilot_event_setting() then return new; end if;
  if new.audience <> 'public' or new.pricing_mode <> 'free'
    or new.price_minor <> 0 or new.starts_at < now() + interval '7 days' then
    raise exception 'Pilot event must be free and at least seven days away'; end if;
  if (select count(*) from public.member_event_proposals proposal
      where proposal.proposed_by = actor and proposal.pilot_auto_draft) >= 2 then
    raise exception 'The pilot allows two private events per Host. Ask the team to review another idea'; end if;
  if new.format in ('in_person', 'hybrid') then
    insert into public.venues(name, city, country, address_line, map_url)
    values (trim(new.venue_name), trim(new.city), new.country,
      nullif(trim(coalesce(new.address_line, '')), ''),
      nullif(trim(coalesce(new.map_url, '')), '')) returning id into saved_venue;
  end if;
  saved_slug := coalesce(nullif(trim(both '-' from lower(regexp_replace(trim(new.title),
    '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'event') || '-' ||
    to_char(new.starts_at at time zone new.timezone, 'YYYY-MM-DD') || '-' ||
    left(new.id::text, 8);
  insert into public.events(
    slug, title, summary, format, status, starts_at, ends_at, timezone,
    venue_id, capacity, registration_mode, is_featured, audience, created_by, updated_by
  ) values (
    saved_slug, trim(new.title), trim(new.summary), new.format,
    'draft', new.starts_at, new.ends_at, new.timezone,
    saved_venue, new.capacity, 'manual_review', false, 'public', actor, actor
  ) returning id into saved_event;
  insert into public.event_private_details(event_id, online_url, check_in_instructions)
  values (saved_event, nullif(trim(coalesce(new.online_url, '')), ''),
    'Follow the event team instructions. Escalate safety concerns through Her Africa Table support.');
  insert into public.ticket_types(
    event_id, name, description, price_minor, currency, inventory_quantity,
    sales_start_at, sales_end_at, status, sort_order
  ) values (
    saved_event, 'Complimentary place', 'A complimentary place at this member-hosted event.',
    0, 'KES', new.capacity, now(), new.starts_at, 'draft', 0
  );
  insert into public.event_hosts(event_id, user_id, status, assigned_by)
  values (saved_event, actor, 'active', actor);
  insert into public.event_host_workspaces(event_id) values (saved_event);
  update public.member_event_proposals
  set status = 'approved', canonical_event_id = saved_event,
    pilot_auto_draft = true,
    review_note = 'Your private event workspace is ready. The team will review safety and public launch later.',
    reviewed_at = now(), updated_at = now()
  where id = new.id and status = 'submitted';
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor, 'event.pilot_private_draft_created', 'event', saved_event,
    jsonb_build_object('proposal_id', new.id, 'publication_status', 'private',
      'host_id', actor));
  perform public.enqueue_notification(actor, 'event', 'Your private event is ready',
    'Open your Host workspace to prepare the event. Our team must approve it before anyone can book a place.',
    '/events/' || saved_slug || '/host', 'pilot-event-draft:' || new.id);
  return new;
end;
$$;

-- This project has explicit default EXECUTE grants to anon/authenticated.
-- Revoking PUBLIC alone therefore does not close privileged RPC entrypoints.
revoke all on function public.assign_founding_community_pilot_access() from public, anon, authenticated;
revoke all on function public.create_founding_community_pilot_draft() from public, anon, authenticated;
revoke all on function public.reset_community_pilot_setting() from public, anon, authenticated;
revoke all on function public.create_invited_pilot_event_draft() from public, anon, authenticated;
revoke all on function public.prevent_community_financial_mutation() from public, anon, authenticated;
revoke all on function public.community_pilot_member_ready(uuid) from public, anon;
revoke all on function public.founding_pilot_member_ready(uuid) from public, anon;
revoke all on function public.get_community_pilot_admin() from public, anon;
revoke all on function public.set_community_pilot_setting(boolean,text) from public, anon;
revoke all on function public.submit_membership_application(text,text,text,text,text,text,text,boolean) from public, anon;
revoke all on function public.get_pilot_free_event_setting() from public, anon;
revoke all on function public.get_invited_pilot_event_setting() from public, anon;
revoke all on function public.publish_pilot_free_event(uuid) from public, anon;
revoke all on function public.list_my_host_event_communities(uuid) from public, anon;
revoke all on function public.link_my_host_event_community(uuid,uuid) from public, anon;
revoke all on function public.create_table_invitation(text,uuid,text,text) from public, anon;
revoke all on function public.list_my_table_invitations(text,uuid) from public, anon;
revoke all on function public.review_table_invitation(uuid,text,text) from public, anon;
revoke all on function public.claim_table_invitation(text) from public, anon;
grant execute on function public.founding_pilot_member_ready(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
