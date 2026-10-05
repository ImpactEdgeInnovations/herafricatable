begin;

-- During the existing 60-day membership pilot, active members may publish
-- their own free events. This is independent of the earlier direct-invite
-- private-draft path and is off outside the timed pilot.
alter table public.invited_pilot_event_settings
  add column if not exists auto_publish_free_events boolean not null default false;

-- Carry the already-enabled event pilot forward once, without opening public
-- publishing where the event pilot was not enabled by Admin.
update public.invited_pilot_event_settings
set auto_publish_free_events = true, updated_at = now()
where id = true and auto_private_drafts = true
  and public.get_membership_intake_mode() = 'trusted_auto';

create or replace function public.get_pilot_free_event_setting()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.get_membership_intake_mode() = 'trusted_auto'
    and coalesce((select auto_publish_free_events
      from public.invited_pilot_event_settings where id = true), false);
$$;
revoke all on function public.get_pilot_free_event_setting() from public;
grant execute on function public.get_pilot_free_event_setting() to authenticated;

create or replace function public.set_pilot_free_event_setting(
  p_enabled boolean, p_reason text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare prior boolean;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required'; end if;
  if p_enabled is null or char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Choose a setting and record a clear reason'; end if;
  if p_enabled and public.get_membership_intake_mode() <> 'trusted_auto' then
    raise exception 'The 60-day membership pilot must be active'; end if;
  select auto_publish_free_events into prior
  from public.invited_pilot_event_settings where id = true for update;
  update public.invited_pilot_event_settings
  set auto_publish_free_events = p_enabled,
      updated_by = auth.uid(), updated_at = now()
  where id = true;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.pilot_free_publication_changed', 'event_pilot',
    auth.uid(), jsonb_build_object('previous', prior, 'enabled', p_enabled,
      'reason', trim(p_reason)));
  return p_enabled;
end;
$$;
revoke all on function public.set_pilot_free_event_setting(boolean,text) from public;
grant execute on function public.set_pilot_free_event_setting(boolean,text) to authenticated;

create or replace function public.reset_invited_pilot_event_setting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.mode <> 'trusted_auto'
    or new.trusted_auto_expires_at is distinct from old.trusted_auto_expires_at then
    update public.invited_pilot_event_settings
    set auto_private_drafts = false, auto_publish_free_events = false,
        updated_at = now() where id = true;
  end if;
  return new;
end;
$$;

create or replace function public.publish_pilot_free_event(p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  proposal public.member_event_proposals%rowtype;
  saved_venue uuid;
  saved_event uuid;
  saved_slug text;
begin
  if actor is null or not public.is_active_member(actor)
    or not public.get_pilot_free_event_setting() then
    raise exception 'Automatic free event publishing is not available';
  end if;
  select * into proposal from public.member_event_proposals
  where id = p_proposal_id for update;
  if not found or proposal.proposed_by <> actor or proposal.status <> 'submitted'
    or proposal.canonical_event_id is not null then
    raise exception 'Only your submitted, unpublished event can be opened';
  end if;
  if proposal.audience <> 'public' or proposal.pricing_mode <> 'free'
    or proposal.price_minor <> 0 or proposal.starts_at < now() + interval '7 days'
    or proposal.ends_at <= proposal.starts_at
    or proposal.capacity not between 5 and 500
    or char_length(trim(proposal.safety_contact_name)) < 2
    or char_length(trim(proposal.safety_contact_phone)) < 7 then
    raise exception 'Complete the free event, date, capacity and day-of-event contact';
  end if;
  if proposal.format in ('in_person', 'hybrid') then
    if nullif(trim(coalesce(proposal.venue_name, '')), '') is null
      or nullif(trim(coalesce(proposal.city, '')), '') is null
      or nullif(trim(coalesce(proposal.country, '')), '') is null
      or (nullif(trim(coalesce(proposal.address_line, '')), '') is null
        and nullif(trim(coalesce(proposal.map_url, '')), '') is null) then
      raise exception 'Add the venue and either its address or map link';
    end if;
    if proposal.map_url is not null and proposal.map_url !~* '^https://[^[:space:]]+$' then
      raise exception 'The map link must begin with https://';
    end if;
    insert into public.venues(name, city, country, address_line, map_url)
    values (trim(proposal.venue_name), trim(proposal.city),
      trim(proposal.country), nullif(trim(coalesce(proposal.address_line, '')), ''),
      nullif(trim(coalesce(proposal.map_url, '')), ''))
    returning id into saved_venue;
  end if;
  if proposal.format in ('virtual', 'hybrid')
    and coalesce(proposal.online_url, '') !~* '^https://[^[:space:]]+$' then
    raise exception 'Add a secure online meeting link';
  end if;
  if (select count(*) from public.member_event_proposals existing
      where existing.proposed_by = actor and existing.pilot_auto_draft) >= 2 then
    raise exception 'You have two pilot events. Ask the team to review another idea';
  end if;

  saved_slug := coalesce(nullif(trim(both '-' from lower(regexp_replace(trim(proposal.title),
    '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'event') || '-' ||
    to_char(proposal.starts_at at time zone proposal.timezone, 'YYYY-MM-DD') ||
    '-' || left(proposal.id::text, 8);
  insert into public.events(
    slug, title, summary, format, status, starts_at, ends_at, timezone,
    venue_id, capacity, registration_mode, is_featured, audience,
    created_by, updated_by
  ) values (
    saved_slug, trim(proposal.title), trim(proposal.summary), proposal.format,
    'draft', proposal.starts_at, proposal.ends_at, proposal.timezone,
    saved_venue, proposal.capacity, 'manual_review', false, 'public', actor, actor
  ) returning id into saved_event;
  insert into public.event_private_details(event_id, online_url, check_in_instructions)
  values (saved_event, nullif(trim(coalesce(proposal.online_url, '')), ''),
    'Follow the event team instructions. Escalate safety concerns through Her Africa Table support.');
  insert into public.ticket_types(
    event_id, name, description, price_minor, currency, inventory_quantity,
    sales_start_at, sales_end_at, status, sort_order
  ) values (
    saved_event, 'Complimentary place', 'A complimentary place at this member-hosted event.',
    0, 'KES', proposal.capacity, now(), proposal.starts_at, 'draft', 0
  );
  insert into public.event_hosts(event_id, user_id, status, assigned_by)
  values (saved_event, actor, 'active', actor);
  insert into public.event_host_workspaces(event_id) values (saved_event);
  insert into public.event_safety_contacts(event_id, contact_name, contact_phone, updated_by)
  values (saved_event, trim(proposal.safety_contact_name),
    trim(proposal.safety_contact_phone), actor);
  -- Existing arrival, safety, checkout and capacity triggers remain authoritative.
  update public.events set status = 'published', updated_at = now()
  where id = saved_event;
  update public.ticket_types set status = 'on_sale', updated_at = now()
  where event_id = saved_event and status = 'draft';
  update public.member_event_proposals
  set status = 'approved', canonical_event_id = saved_event,
    pilot_auto_draft = true,
    review_note = 'Your free event is open. Guest places are reviewed before confirmation.',
    reviewed_at = now(), updated_at = now()
  where id = p_proposal_id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor, 'event.pilot_free_published', 'event', saved_event,
    jsonb_build_object('proposal_id', p_proposal_id, 'host_id', actor,
      'registration_mode', 'manual_review'));
  perform public.enqueue_notification(actor, 'event', 'Your event is open',
    'Your free event is now public. Open your Host page to prepare for guests. Guest places are reviewed before confirmation.',
    '/events/' || saved_slug, 'pilot-event-public:' || p_proposal_id);
  return saved_event;
end;
$$;
revoke all on function public.publish_pilot_free_event(uuid) from public;
grant execute on function public.publish_pilot_free_event(uuid) to authenticated;

-- The existing private-draft trigger is retained for the case where Admin
-- switches public publishing off but leaves invited private drafts on.
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
  if actor is null or actor <> new.proposed_by or not public.is_active_member(actor)
    or public.get_membership_intake_mode() <> 'trusted_auto' then return new; end if;
  if public.get_pilot_free_event_setting() then
    perform public.publish_pilot_free_event(new.id);
    return new;
  end if;
  if not coalesce((select auto_private_drafts
      from public.invited_pilot_event_settings where id = true), false)
    or not exists (
      select 1 from public.beta_invites invite
      where invite.accepted_by = actor and invite.status = 'accepted'
        and invite.source = 'admin_pilot'
    ) then return new; end if;
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

notify pgrst, 'reload schema';
commit;
