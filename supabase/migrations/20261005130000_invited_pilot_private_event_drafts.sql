begin;

-- An invited pilot member may start a PRIVATE event and become its scoped Host.
-- Publication, paid tickets, and public registration still require Admin review.
create table public.invited_pilot_event_settings (
  id boolean primary key default true check (id),
  auto_private_drafts boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.invited_pilot_event_settings(id) values (true)
on conflict (id) do nothing;
alter table public.invited_pilot_event_settings enable row level security;

alter table public.member_event_proposals
  add column if not exists pilot_auto_draft boolean not null default false;

create or replace function public.get_invited_pilot_event_setting()
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required'; end if;
  return public.get_membership_intake_mode() = 'trusted_auto'
    and coalesce((select auto_private_drafts from public.invited_pilot_event_settings
      where id = true), false);
end;
$$;
revoke all on function public.get_invited_pilot_event_setting() from public;
grant execute on function public.get_invited_pilot_event_setting() to authenticated;

create or replace function public.set_invited_pilot_event_setting(
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
    raise exception 'Enable the timed invited-member pilot first'; end if;
  select auto_private_drafts into prior from public.invited_pilot_event_settings
  where id = true for update;
  update public.invited_pilot_event_settings
  set auto_private_drafts = p_enabled, updated_by = auth.uid(), updated_at = now()
  where id = true;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.pilot_auto_drafts_changed', 'event_pilot', auth.uid(),
    jsonb_build_object('previous', prior, 'enabled', p_enabled,
      'reason', trim(p_reason)));
  return p_enabled;
end;
$$;
revoke all on function public.set_invited_pilot_event_setting(boolean,text) from public;
grant execute on function public.set_invited_pilot_event_setting(boolean,text) to authenticated;

-- A fresh membership window must require a fresh event decision. This also
-- switches event drafts off immediately when Admin returns to manual review.
create or replace function public.reset_invited_pilot_event_setting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.mode <> 'trusted_auto'
    or new.trusted_auto_expires_at is distinct from old.trusted_auto_expires_at then
    update public.invited_pilot_event_settings
    set auto_private_drafts = false, updated_at = now() where id = true;
  end if;
  return new;
end;
$$;
drop trigger if exists reset_invited_pilot_event_setting_on_intake
  on public.membership_intake_settings;
create trigger reset_invited_pilot_event_setting_on_intake
after update of mode, trusted_auto_expires_at on public.membership_intake_settings
for each row execute function public.reset_invited_pilot_event_setting();
revoke all on function public.reset_invited_pilot_event_setting() from public;

create or replace function public.create_invited_pilot_event_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_venue uuid;
  saved_event uuid;
  saved_slug text;
begin
  if new.status <> 'submitted'
    or (tg_op = 'UPDATE' and old.status = 'submitted') then
    return new;
  end if;
  if actor is null or actor <> new.proposed_by
    or not public.is_active_member(actor)
    or public.get_membership_intake_mode() <> 'trusted_auto'
    or not coalesce((select auto_private_drafts
      from public.invited_pilot_event_settings where id = true), false)
    or not exists (
      select 1 from public.beta_invites invite
      where invite.accepted_by = actor and invite.status = 'accepted'
        and invite.source = 'admin_pilot'
    ) then
    return new;
  end if;
  if new.audience <> 'public' or new.pricing_mode <> 'free'
    or new.price_minor <> 0 or new.starts_at < now() + interval '7 days' then
    raise exception 'Pilot event must be free and at least seven days away';
  end if;
  if (select count(*) from public.member_event_proposals proposal
      where proposal.proposed_by = actor and proposal.pilot_auto_draft) >= 2 then
    raise exception 'The pilot allows two private events per Host. Ask the team to review another idea';
  end if;

  if new.format in ('in_person', 'hybrid') then
    insert into public.venues(name, city, country, address_line, map_url)
    values (trim(new.venue_name), trim(new.city), new.country,
      nullif(trim(coalesce(new.address_line, '')), ''),
      nullif(trim(coalesce(new.map_url, '')), ''))
    returning id into saved_venue;
  end if;
  saved_slug := trim(both '-' from lower(regexp_replace(trim(new.title),
    '[^a-zA-Z0-9]+', '-', 'g'))) || '-' ||
    to_char(new.starts_at at time zone new.timezone, 'YYYY-MM-DD') || '-' ||
    left(new.id::text, 8);
  insert into public.events(
    slug, title, summary, format, status, starts_at, ends_at, timezone,
    venue_id, capacity, registration_mode, is_featured, audience,
    created_by, updated_by
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

drop trigger if exists invited_pilot_event_draft_after_submit
  on public.member_event_proposals;
create trigger invited_pilot_event_draft_after_submit
after insert or update of status on public.member_event_proposals
for each row execute function public.create_invited_pilot_event_draft();

revoke all on function public.create_invited_pilot_event_draft() from public;
notify pgrst, 'reload schema';
commit;
