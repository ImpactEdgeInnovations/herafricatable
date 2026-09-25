begin;

-- Link only an attendee's own opt-in to the invitation created for that event.
-- This allows withdrawal without touching unrelated personal invitations.
create table public.event_follow_up_invitation_links (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invitation_id uuid not null unique references public.table_invitations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_follow_up_invitation_links enable row level security;
revoke all on public.event_follow_up_invitation_links from anon, authenticated;

-- This helper is deliberately not callable by signed-in clients. All public
-- entry points below apply their own caller and event-state checks.
create function public.event_follow_up_attendee_eligible(
  p_event_id uuid, p_user_id uuid
)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.event_memberships attendance
    join public.events event on event.id = attendance.event_id
    join public.profiles profile on profile.id = attendance.user_id
    where attendance.event_id = p_event_id
      and attendance.user_id = p_user_id
      and attendance.status in ('confirmed', 'attended')
      and event.status in ('published', 'completed')
      and profile.access_status in ('pending', 'onboarding', 'active')
      and (
        public.is_active_member(attendance.user_id)
        or (
          profile.access_status in ('pending', 'onboarding')
          and event.audience = 'public'
          and exists (
            select 1 from public.entitlements entitlement
            where entitlement.user_id = attendance.user_id
              and entitlement.event_id = event.id
              and entitlement.entitlement_type = 'event_access'
              and entitlement.status = 'active'
          )
        )
      )
  );
$$;
revoke all on function public.event_follow_up_attendee_eligible(uuid, uuid) from public;

create or replace function public.can_leave_event_feedback(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.event_follow_up_attendee_eligible(p_event_id, auth.uid())
    and exists (
      select 1 from public.events event
      where event.id = p_event_id and event.ends_at < now()
    );
$$;

create or replace function public.can_choose_event_follow_up(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.event_follow_up_attendee_eligible(p_event_id, auth.uid());
$$;

-- The list exposes only opted-in, eligible attendees to a Super Admin. A Host
-- gets aggregate interest counts elsewhere, never identities from this queue.
create function public.list_event_follow_up_candidates_admin()
returns table(
  event_id uuid, event_title text, event_slug text,
  attendee_id uuid, attendee_name text, attendee_email text,
  is_test_account boolean,
  community_id uuid, community_name text, community_slug text,
  invitation_id uuid, invitation_status text, delivery_status text,
  opted_in_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  return query
  select event.id, event.title, event.slug,
    interest.user_id, coalesce(nullif(trim(profile.display_name), ''), 'Event guest'),
    account.email::text, profile.is_test_account,
    continuation.community_id, community.name, community.slug,
    invitation.id, invitation.status,
    (select job.status from public.notification_jobs job
     where job.user_id = interest.user_id
       and job.dedupe_key = 'table-invitation:' || invitation.id
     limit 1), interest.updated_at
  from public.event_follow_up_interests interest
  join public.events event on event.id = interest.event_id
  join public.member_event_proposals proposal
    on proposal.canonical_event_id = event.id
   and proposal.status = 'approved' and proposal.community_after_event
  join public.profiles profile on profile.id = interest.user_id
  join auth.users account on account.id = interest.user_id
  left join public.event_community_continuations continuation
    on continuation.event_id = event.id
  left join public.communities community
    on community.id = continuation.community_id and community.status = 'published'
  left join public.event_follow_up_invitation_links follow_up
    on follow_up.event_id = event.id and follow_up.user_id = interest.user_id
  left join public.table_invitations invitation
    on invitation.id = follow_up.invitation_id
  where interest.interested and event.ends_at < now()
    and public.event_follow_up_attendee_eligible(event.id, interest.user_id)
  order by interest.updated_at desc limit 200;
end;
$$;
revoke all on function public.list_event_follow_up_candidates_admin() from public;
grant execute on function public.list_event_follow_up_candidates_admin() to authenticated;

create function public.invite_event_follow_up_guest(
  p_event_id uuid, p_user_id uuid
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.event_follow_up_interests%rowtype;
  destination record;
  recipient text;
  raw_token text;
  saved uuid;
  prior uuid;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  select * into target from public.event_follow_up_interests interest
  where interest.event_id = p_event_id and interest.user_id = p_user_id
  for update;
  if not found or not target.interested
    or not public.event_follow_up_attendee_eligible(p_event_id, p_user_id)
    or not exists (
      select 1 from public.member_event_proposals proposal
      join public.events event on event.id = proposal.canonical_event_id
      where event.id = p_event_id and event.ends_at < now()
        and proposal.status = 'approved' and proposal.community_after_event
    ) then
    raise exception 'This attendee has no current follow-up request';
  end if;

  select community.id, community.name, community.slug into destination
  from public.event_community_continuations continuation
  join public.communities community on community.id = continuation.community_id
  where continuation.event_id = p_event_id and community.status = 'published';
  if destination.id is null then
    raise exception 'Approve and publish the follow-up Community first';
  end if;
  if exists (
    select 1 from public.community_memberships membership
    where membership.community_id = destination.id
      and membership.user_id = p_user_id
      and membership.status in ('active', 'invited', 'requested', 'approved_pending_payment')
  ) then
    raise exception 'This attendee already has a Community place or request';
  end if;
  select lower(account.email) into recipient
  from auth.users account where account.id = p_user_id;
  if recipient is null or p_user_id = actor then
    raise exception 'Choose another attendee with a verified email';
  end if;
  if exists (
    select 1 from public.table_invitations invitation
    where invitation.invitee_email = recipient
      and invitation.destination_type = 'community'
      and invitation.community_id = destination.id
      and invitation.status in ('pending_review', 'sent', 'opened', 'membership_pending', 'claimed')
  ) then
    raise exception 'An invitation to this Community is already open';
  end if;
  select link.invitation_id into prior
  from public.event_follow_up_invitation_links link
  where link.event_id = p_event_id and link.user_id = p_user_id;
  if prior is not null and exists (
    select 1 from public.table_invitations invitation
    where invitation.id = prior and invitation.status not in ('revoked', 'expired', 'rejected')
  ) then
    raise exception 'This event already has an invitation for this attendee';
  end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.table_invitations (
    inviter_id, invitee_email, invitee_user_id, destination_type,
    community_id, personal_note, status, token_hash, reviewed_by,
    reviewed_at, sent_at, expires_at
  ) values (
    actor, recipient, p_user_id, 'community', destination.id,
    'You asked to hear about the Community after your event. You can decide whether to join.',
    'sent', encode(digest(raw_token, 'sha256'), 'hex'), actor,
    now(), now(), now() + interval '30 days'
  ) returning id into saved;
  insert into public.event_follow_up_invitation_links(event_id, user_id, invitation_id)
  values (p_event_id, p_user_id, saved)
  on conflict(event_id, user_id) do update
    set invitation_id = excluded.invitation_id, created_at = now();

  perform public.enqueue_notification(
    p_user_id, 'event', 'Your invitation to ' || destination.name,
    'You asked to hear about the Community after your event. Open your private invitation to decide whether to join.',
    '/join/' || raw_token, 'table-invitation:' || saved
  );
  update public.notification_jobs set template_key = 'table_invitation'
  where user_id = p_user_id and dedupe_key = 'table-invitation:' || saved
    and status = 'queued';
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor, 'event.follow_up_invited', 'table_invitation', saved,
    jsonb_build_object('event_id', p_event_id, 'community_id', destination.id));
  return saved;
end;
$$;
revoke all on function public.invite_event_follow_up_guest(uuid, uuid) from public;
grant execute on function public.invite_event_follow_up_guest(uuid, uuid) to authenticated;

create function public.close_event_follow_up_invitation(
  p_event_id uuid, p_user_id uuid, p_reason text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare saved uuid;
begin
  select link.invitation_id into saved
  from public.event_follow_up_invitation_links link
  where link.event_id = p_event_id and link.user_id = p_user_id;
  if saved is null then return; end if;
  update public.table_invitations set status = 'revoked', token_hash = null,
    review_note = left(p_reason, 400), updated_at = now()
  where id = saved and status in ('sent', 'opened', 'membership_pending', 'claimed');
  update public.notification_jobs set status = 'suppressed', updated_at = now()
  where user_id = p_user_id and dedupe_key = 'table-invitation:' || saved
    and status in ('queued', 'failed');
  delete from public.notifications
  where user_id = p_user_id and dedupe_key = 'table-invitation:' || saved;
end;
$$;
revoke all on function public.close_event_follow_up_invitation(uuid, uuid, text) from public;

create function public.close_invalidated_event_follow_up_invitation()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare linked record;
begin
  if tg_table_name = 'entitlements' then
    if old.entitlement_type = 'event_access' and old.status = 'active'
      and new.status <> 'active' and old.event_id is not null then
      perform public.close_event_follow_up_invitation(
        old.event_id, old.user_id, 'Event access ended'
      );
    end if;
  elsif tg_table_name = 'profiles' then
    if new.access_status in ('suspended', 'deleted', 'dormant')
      and old.access_status is distinct from new.access_status then
      for linked in
        select link.event_id from public.event_follow_up_invitation_links link
        where link.user_id = new.id
      loop
        perform public.close_event_follow_up_invitation(
          linked.event_id, new.id, 'Account access ended'
        );
      end loop;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.close_invalidated_event_follow_up_invitation() from public;

create trigger close_event_follow_up_on_entitlement_change
after update of status on public.entitlements
for each row execute function public.close_invalidated_event_follow_up_invitation();
create trigger close_event_follow_up_on_profile_change
after update of access_status on public.profiles
for each row execute function public.close_invalidated_event_follow_up_invitation();

create or replace function public.set_my_event_follow_up_interest(
  p_event_id uuid, p_interested boolean
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  choice_available boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select choice.available into choice_available
  from public.get_my_event_follow_up_interest(p_event_id) choice;
  if coalesce(p_interested, false) and not coalesce(choice_available, false) then
    raise exception 'A confirmed place at this event is required';
  end if;
  if not coalesce(p_interested, false) and not coalesce(choice_available, false)
    and not exists (
      select 1 from public.event_follow_up_interests interest
      where interest.event_id = p_event_id and interest.user_id = auth.uid()
    ) then
    raise exception 'A confirmed place at this event is required';
  end if;
  insert into public.event_follow_up_interests(
    event_id, user_id, interested, updated_at
  ) values (p_event_id, auth.uid(), coalesce(p_interested, false), now())
  on conflict(event_id, user_id) do update
    set interested = excluded.interested, updated_at = now();

  if not coalesce(p_interested, false) then
    perform public.close_event_follow_up_invitation(
      p_event_id, auth.uid(), 'Attendee withdrew follow-up interest'
    );
  end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.follow_up_interest_changed', 'event', p_event_id,
    jsonb_build_object('interested', coalesce(p_interested, false)));
end;
$$;

comment on table public.event_follow_up_invitation_links is
  'Private link between a consenting event attendee and the specific reviewed Community invitation; withdrawal revokes only this link.';

commit;
