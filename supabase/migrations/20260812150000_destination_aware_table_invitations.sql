begin;

create table if not exists public.table_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete restrict,
  invitee_email text not null,
  invitee_user_id uuid references auth.users(id) on delete set null,
  destination_type text not null check (destination_type in ('community', 'event')),
  community_id uuid references public.communities(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  personal_note text check (personal_note is null or char_length(personal_note) between 10 and 600),
  status text not null default 'pending_review' check (
    status in (
      'pending_review', 'sent', 'opened', 'membership_pending',
      'claimed', 'joined', 'rejected', 'revoked', 'expired'
    )
  ),
  token_hash text unique,
  beta_invite_id uuid references public.beta_invites(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  claimed_at timestamptz,
  joined_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint table_invitation_email_normalized
    check (invitee_email = lower(trim(invitee_email))),
  constraint table_invitation_one_destination check (
    (destination_type = 'community' and community_id is not null and event_id is null)
    or (destination_type = 'event' and event_id is not null and community_id is null)
  ),
  constraint table_invitation_token_state check (
    status in ('pending_review', 'rejected', 'revoked', 'expired')
    or token_hash is not null
  )
);

create unique index if not exists table_invitation_open_destination_email_idx
  on public.table_invitations (
    invitee_email,
    destination_type,
    coalesce(community_id, event_id)
  )
  where status in ('pending_review', 'sent', 'opened', 'membership_pending', 'claimed');
create index if not exists table_invitation_admin_queue_idx
  on public.table_invitations (status, created_at);
create index if not exists table_invitation_inviter_idx
  on public.table_invitations (inviter_id, created_at desc);
create index if not exists table_invitation_invitee_idx
  on public.table_invitations (invitee_user_id, updated_at desc)
  where invitee_user_id is not null;

alter table public.table_invitations enable row level security;

drop policy if exists "Inviters read own Table invitations" on public.table_invitations;
create policy "Inviters read own Table invitations"
  on public.table_invitations for select to authenticated
  using (
    inviter_id = auth.uid()
    or invitee_user_id = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  );

create or replace function public.table_invitation_destination(
  p_destination_type text,
  p_community_id uuid,
  p_event_id uuid
)
returns table(destination_name text, destination_href text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_destination_type = 'community' then
    return query
    select community.name, '/communities/' || community.slug
    from public.communities community
    where community.id = p_community_id
      and community.status = 'published';
  elsif p_destination_type = 'event' then
    return query
    select event.title, '/events/' || event.slug || '#registration'
    from public.events event
    where event.id = p_event_id
      and event.status = 'published';
  end if;
end;
$$;

create or replace function public.create_table_invitation(
  p_destination_type text,
  p_destination_id uuid,
  p_email text,
  p_personal_note text default null
)
returns table(invitation_id uuid, invitation_status text, share_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  email_value text := lower(trim(coalesce(p_email, '')));
  clean_note text := nullif(trim(coalesce(p_personal_note, '')), '');
  target_user uuid;
  target_status public.member_access_status;
  destination record;
  saved uuid;
  raw_token text;
  next_status text;
  actor_name text;
begin
  if not public.is_active_member(actor) then
    raise exception 'Active membership required';
  end if;
  if p_destination_type not in ('community', 'event') then
    raise exception 'Choose a Community or event';
  end if;
  if email_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if clean_note is not null and char_length(clean_note) not between 10 and 600 then
    raise exception 'Keep your personal note between 10 and 600 characters';
  end if;
  if (select lower(email) from auth.users where id = actor) = email_value then
    raise exception 'You do not need to invite yourself';
  end if;
  if (
    select count(*) from public.table_invitations invitation
    where invitation.inviter_id = actor
      and invitation.created_at >= now() - interval '24 hours'
      and invitation.status not in ('rejected', 'revoked', 'expired')
  ) >= 20 then
    raise exception 'You have reached today''s invitation limit';
  end if;

  if p_destination_type = 'community' then
    if not public.can_manage_community(p_destination_id, actor) then
      raise exception 'Community Host access required';
    end if;
    select * into destination
    from public.table_invitation_destination('community', p_destination_id, null);
  else
    if not public.can_manage_event(p_destination_id) and not exists (
      select 1 from public.member_event_proposals proposal
      where proposal.event_id = p_destination_id
        and proposal.proposed_by = actor
        and proposal.status = 'approved'
    ) then
      raise exception 'Event Host access required';
    end if;
    select * into destination
    from public.table_invitation_destination('event', null, p_destination_id);
  end if;
  if destination.destination_name is null then
    raise exception 'Invitation destination is not available';
  end if;

  select account.id, profile.access_status
  into target_user, target_status
  from auth.users account
  join public.profiles profile on profile.id = account.id
  where lower(account.email) = email_value
  limit 1;

  raw_token := encode(gen_random_bytes(32), 'hex');
  next_status := case when target_user is not null and target_status = 'active'
    then 'sent' else 'pending_review' end;

  insert into public.table_invitations (
    inviter_id, invitee_email, invitee_user_id, destination_type,
    community_id, event_id, personal_note, status, token_hash,
    sent_at, expires_at
  ) values (
    actor, email_value, target_user, p_destination_type,
    case when p_destination_type = 'community' then p_destination_id end,
    case when p_destination_type = 'event' then p_destination_id end,
    clean_note, next_status,
    case when next_status = 'sent' then encode(digest(raw_token, 'sha256'), 'hex') end,
    case when next_status = 'sent' then now() end,
    case when next_status = 'sent' then now() + interval '30 days' end
  ) returning id into saved;

  select coalesce(nullif(trim(profile.display_name), ''), 'A Her Africa Table member')
  into actor_name from public.profiles profile where profile.id = actor;

  if next_status = 'sent' then
    perform public.enqueue_notification(
      target_user,
      case when p_destination_type = 'event' then 'event' else 'network' end,
      actor_name || ' invited you to ' || destination.destination_name,
      coalesce(clean_note, 'You have a personal invitation waiting at Her Africa Table.'),
      '/join/' || raw_token,
      'table-invitation:' || saved
    );
    update public.notification_jobs
    set template_key = 'table_invitation'
    where user_id = target_user
      and dedupe_key = 'table-invitation:' || saved
      and status = 'queued';
  else
    perform public.enqueue_notification(
      administrator.user_id,
      'system',
      'Invitation waiting for review',
      actor_name || ' would like to invite someone to ' || destination.destination_name || '.',
      '/admin/invitations',
      'table-invitation-review:' || saved || ':' || administrator.user_id
    )
    from public.user_roles administrator
    where administrator.role = 'super_admin';
  end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'table_invitation.created', 'table_invitation', saved,
    jsonb_build_object('destination_type', p_destination_type, 'status', next_status)
  );

  -- Delivery links remain inside the protected notification queue. The sender
  -- receives status only and never needs the recipient's bearer token.
  return query select saved, next_status, null::text;
exception when unique_violation then
  raise exception 'This email already has an open invitation for this destination';
end;
$$;

create or replace function public.list_my_table_invitations(
  p_destination_type text,
  p_destination_id uuid
)
returns table(
  invitation_id uuid,
  invitee_email text,
  invitation_status text,
  personal_note text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_destination_type = 'community'
    and not public.can_manage_community(p_destination_id) then
    raise exception 'Community Host access required';
  end if;
  if p_destination_type = 'event'
    and not public.can_manage_event(p_destination_id)
    and not exists (
      select 1 from public.member_event_proposals proposal
      where proposal.event_id = p_destination_id
        and proposal.proposed_by = auth.uid()
        and proposal.status = 'approved'
    ) then
    raise exception 'Event Host access required';
  end if;

  return query
  select invitation.id, invitation.invitee_email, invitation.status,
    invitation.personal_note, invitation.created_at, invitation.expires_at
  from public.table_invitations invitation
  where invitation.inviter_id = auth.uid()
    and invitation.destination_type = p_destination_type
    and (
      (p_destination_type = 'community' and invitation.community_id = p_destination_id)
      or (p_destination_type = 'event' and invitation.event_id = p_destination_id)
    )
  order by invitation.created_at desc
  limit 50;
end;
$$;

create or replace function public.list_admin_table_invitations()
returns table(
  invitation_id uuid,
  inviter_name text,
  inviter_email text,
  invitee_email text,
  destination_type text,
  destination_name text,
  personal_note text,
  invitation_status text,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  return query
  select invitation.id, profile.display_name, account.email::text,
    invitation.invitee_email, invitation.destination_type,
    coalesce(community.name, event.title), invitation.personal_note,
    invitation.status, invitation.review_note, invitation.created_at,
    invitation.reviewed_at, invitation.expires_at
  from public.table_invitations invitation
  join auth.users account on account.id = invitation.inviter_id
  left join public.profiles profile on profile.id = invitation.inviter_id
  left join public.communities community on community.id = invitation.community_id
  left join public.events event on event.id = invitation.event_id
  order by case invitation.status when 'pending_review' then 0 else 1 end,
    invitation.created_at desc
  limit 250;
end;
$$;

create or replace function public.review_table_invitation(
  p_invitation_id uuid,
  p_action text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.table_invitations%rowtype;
  destination record;
  raw_token text;
  invite_record uuid;
  actor_name text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if p_action not in ('approve', 'reject', 'revoke') then
    raise exception 'Choose approve, decline or revoke';
  end if;
  if p_action in ('reject', 'revoke')
    and char_length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Add a short reason';
  end if;

  select * into target from public.table_invitations
  where id = p_invitation_id for update;
  if not found then raise exception 'Invitation not found'; end if;

  if p_action in ('approve', 'reject') and target.status <> 'pending_review' then
    raise exception 'This invitation has already been reviewed';
  end if;
  if p_action = 'revoke' and target.status not in ('sent', 'opened', 'membership_pending', 'claimed') then
    raise exception 'This invitation cannot be revoked';
  end if;

  if p_action = 'approve' then
    insert into public.beta_invites(email, status, invited_by, expires_at)
    values (target.invitee_email, 'pending', auth.uid(), now() + interval '30 days')
    on conflict do nothing;
    select invite.id into invite_record
    from public.beta_invites invite
    where invite.email = target.invitee_email and invite.status = 'pending'
    order by invite.created_at desc limit 1;

    raw_token := encode(gen_random_bytes(32), 'hex');
    update public.table_invitations set
      status = 'sent', token_hash = encode(digest(raw_token, 'sha256'), 'hex'),
      beta_invite_id = invite_record, reviewed_by = auth.uid(),
      review_note = nullif(trim(coalesce(p_note, '')), ''), reviewed_at = now(),
      sent_at = now(), expires_at = now() + interval '30 days', updated_at = now()
    where id = target.id;

    select * into destination from public.table_invitation_destination(
      target.destination_type, target.community_id, target.event_id
    );
    select coalesce(nullif(trim(profile.display_name), ''), 'A Her Africa Table member')
    into actor_name from public.profiles profile where profile.id = target.inviter_id;

    insert into public.notification_jobs(
      user_id, template_key, to_email, payload, dedupe_key
    ) values (
      target.inviter_id, 'table_invitation', target.invitee_email,
      jsonb_build_object(
        'title', actor_name || ' invited you to ' || destination.destination_name,
        'body', coalesce(target.personal_note, 'You have a personal invitation to join Her Africa Table and continue to this ' || target.destination_type || '.'),
        'href', '/join/' || raw_token
      ),
      'table-invitation:' || target.id
    ) on conflict(user_id, channel, dedupe_key) do nothing;
  elsif p_action = 'reject' then
    update public.table_invitations set status = 'rejected',
      reviewed_by = auth.uid(), review_note = trim(p_note), reviewed_at = now(),
      updated_at = now() where id = target.id;
  else
    update public.beta_invites set status = 'revoked'
    where id = target.beta_invite_id and status = 'pending';
    update public.table_invitations set status = 'revoked', token_hash = null,
      reviewed_by = auth.uid(), review_note = trim(p_note), reviewed_at = now(),
      updated_at = now() where id = target.id;
  end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'table_invitation.' || p_action, 'table_invitation', target.id,
    jsonb_build_object('destination_type', target.destination_type));
end;
$$;

create or replace function public.preview_table_invitation(p_token text)
returns table(
  invitation_id uuid,
  inviter_name text,
  destination_type text,
  destination_name text,
  destination_href text,
  personal_note text,
  invitation_status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare target public.table_invitations%rowtype;
begin
  if char_length(coalesce(p_token, '')) <> 64 then return; end if;
  select * into target from public.table_invitations invitation
  where invitation.token_hash = encode(digest(p_token, 'sha256'), 'hex')
  limit 1;
  if not found or target.status in ('rejected', 'revoked') then return; end if;
  if target.expires_at <= now() then
    update public.table_invitations set status = 'expired', token_hash = null,
      updated_at = now() where id = target.id;
    return;
  end if;
  if target.status = 'sent' then
    update public.table_invitations set status = 'opened',
      opened_at = coalesce(opened_at, now()), updated_at = now()
    where id = target.id;
  end if;
  return query
  select target.id,
    coalesce(nullif(trim(profile.display_name), ''), 'A Her Africa Table member'),
    target.destination_type, destination.destination_name,
    destination.destination_href, target.personal_note,
    case when target.status = 'sent' then 'opened' else target.status end,
    target.expires_at
  from public.profiles profile
  cross join lateral public.table_invitation_destination(
    target.destination_type, target.community_id, target.event_id
  ) destination
  where profile.id = target.inviter_id;
end;
$$;

create or replace function public.claim_table_invitation(p_token text)
returns table(claim_status text, destination_href text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  member_status public.member_access_status;
  target public.table_invitations%rowtype;
  destination record;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  select lower(account.email), profile.access_status
  into actor_email, member_status
  from auth.users account join public.profiles profile on profile.id = account.id
  where account.id = actor;

  select * into target from public.table_invitations invitation
  where invitation.token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;
  if not found or target.status in ('rejected', 'revoked', 'expired')
    or target.expires_at <= now() then
    raise exception 'This invitation is no longer available';
  end if;
  if actor_email <> target.invitee_email then
    raise exception 'Use the email address that received this invitation';
  end if;

  select * into destination from public.table_invitation_destination(
    target.destination_type, target.community_id, target.event_id
  );

  if member_status <> 'active' then
    update public.table_invitations set status = 'membership_pending',
      invitee_user_id = actor, updated_at = now() where id = target.id;
    return query select 'membership_pending'::text,
      '/apply?next=' || replace('/join/' || p_token, '?', '%3F');
    return;
  end if;

  if target.destination_type = 'community' then
    begin
      perform public.request_community_access(target.community_id);
    exception when others then
      if sqlerrm <> 'Membership already exists' then raise; end if;
    end;
    update public.table_invitations set status = 'joined',
      invitee_user_id = actor, claimed_at = coalesce(claimed_at, now()),
      joined_at = now(), updated_at = now() where id = target.id;
    return query select 'community_ready'::text, destination.destination_href;
  else
    update public.table_invitations set status = 'claimed',
      invitee_user_id = actor, claimed_at = coalesce(claimed_at, now()),
      updated_at = now() where id = target.id;
    return query select 'event_ready'::text, destination.destination_href;
  end if;
end;
$$;

create or replace function public.resume_table_invitations_after_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.table_invitations%rowtype;
  community public.communities%rowtype;
  paid_offer boolean;
  next_status text;
  destination record;
  host record;
begin
  if new.access_status <> 'active'
    or old.access_status is not distinct from 'active' then
    return new;
  end if;

  for invitation in
    select * from public.table_invitations pending
    where pending.invitee_user_id = new.id
      and pending.status = 'membership_pending'
      and pending.expires_at > now()
    for update
  loop
    select * into destination from public.table_invitation_destination(
      invitation.destination_type, invitation.community_id, invitation.event_id
    );

    if invitation.destination_type = 'community' then
      select * into community from public.communities
      where id = invitation.community_id and status = 'published';
      if not found then continue; end if;

      select exists (
        select 1 from public.community_offers offer
        where offer.community_id = invitation.community_id
          and offer.status = 'published' and offer.access_type = 'paid'
      ) into paid_offer;
      next_status := case
        when community.community_type = 'private' or community.admission_mode = 'approval'
          then 'requested'
        when paid_offer then 'approved_pending_payment'
        else 'active'
      end;

      insert into public.community_memberships(
        community_id, user_id, role, status, joined_at
      ) values (
        invitation.community_id, new.id, 'member', next_status,
        case when next_status = 'active' then now() end
      )
      on conflict(community_id, user_id) do update set
        role = 'member', status = excluded.status,
        joined_at = case when excluded.status = 'active'
          then coalesce(public.community_memberships.joined_at, now())
          else public.community_memberships.joined_at end,
        updated_at = now()
      where public.community_memberships.status in ('declined', 'removed');

      if next_status = 'requested' then
        perform public.enqueue_notification(
          host.user_id, 'network', 'New request to join ' || community.name,
          coalesce(nullif(trim(new.display_name), ''), 'A member') ||
            ' arrived through a personal invitation and would like to join.',
          '/communities/' || community.slug || '/host#admissions',
          'table-invitation-community-request:' || invitation.id || ':' || host.user_id
        )
        from public.community_memberships host
        where host.community_id = community.id and host.status = 'active'
          and host.role in ('owner', 'moderator');
      end if;

      update public.table_invitations set status = 'joined', joined_at = now(),
        claimed_at = coalesce(claimed_at, now()), updated_at = now()
      where id = invitation.id;
      perform public.enqueue_notification(
        new.id, 'network',
        case when next_status = 'active' then 'Your Community invitation is ready'
          else 'Your Community request is ready' end,
        case when next_status = 'active'
          then 'Your membership is active and the Community is ready to open.'
          else 'Your membership is active. The Community Host will now review your request.' end,
        destination.destination_href,
        'table-invitation-resumed:' || invitation.id
      );
    else
      update public.table_invitations set status = 'claimed',
        claimed_at = coalesce(claimed_at, now()), updated_at = now()
      where id = invitation.id;
      perform public.enqueue_notification(
        new.id, 'event', 'Your event invitation is ready',
        'Your membership is active. Choose your ticket or request your seat on the event page.',
        destination.destination_href,
        'table-invitation-resumed:' || invitation.id
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists resume_table_invitations_on_activation on public.profiles;
create trigger resume_table_invitations_on_activation
after update of access_status on public.profiles
for each row execute function public.resume_table_invitations_after_activation();

revoke all on function public.table_invitation_destination(text, uuid, uuid) from public;
revoke all on function public.create_table_invitation(text, uuid, text, text) from public;
grant execute on function public.create_table_invitation(text, uuid, text, text) to authenticated;
revoke all on function public.list_my_table_invitations(text, uuid) from public;
grant execute on function public.list_my_table_invitations(text, uuid) to authenticated;
revoke all on function public.list_admin_table_invitations() from public;
grant execute on function public.list_admin_table_invitations() to authenticated;
revoke all on function public.review_table_invitation(uuid, text, text) from public;
grant execute on function public.review_table_invitation(uuid, text, text) to authenticated;
revoke all on function public.preview_table_invitation(text) from public;
grant execute on function public.preview_table_invitation(text) to anon, authenticated;
revoke all on function public.claim_table_invitation(text) from public;
grant execute on function public.claim_table_invitation(text) to authenticated;

comment on table public.table_invitations is
  'Destination-aware invitations. Existing active members receive them immediately; external and pending emails require Super Admin review before delivery.';
comment on function public.claim_table_invitation(text) is
  'Email-bound claim that preserves platform membership, Community admission and event registration boundaries.';

commit;
