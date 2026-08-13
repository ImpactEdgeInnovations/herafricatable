begin;

create or replace function public.get_my_membership_invitation_context()
returns table(
  verified boolean,
  source_label text,
  introduced_by text,
  context_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;

  select lower(account.email)
  into actor_email
  from auth.users account
  where account.id = actor;

  return query
  select
    true,
    'Verified member invitation'::text,
    coalesce(nullif(trim(referrer_profile.display_name), ''), 'A Her Africa Table member'),
    campaign.name
  from public.referral_invitations invitation
  join public.referral_campaigns campaign on campaign.id = invitation.campaign_id
  left join public.profiles referrer_profile on referrer_profile.id = invitation.referrer_id
  where invitation.invitee_email = actor_email
    and invitation.status in ('approved', 'claimed')
    and (invitation.expires_at is null or invitation.expires_at > now())
  order by invitation.created_at desc
  limit 1;

  if found then return; end if;

  return query
  select
    true,
    'Personal invitation'::text,
    coalesce(nullif(trim(inviter_profile.display_name), ''), 'A Her Africa Table member'),
    coalesce(community.name, event.title)
  from public.table_invitations invitation
  left join public.profiles inviter_profile on inviter_profile.id = invitation.inviter_id
  left join public.communities community on community.id = invitation.community_id
  left join public.events event on event.id = invitation.event_id
  where invitation.invitee_email = actor_email
    and invitation.status in ('sent', 'opened', 'membership_pending', 'claimed')
    and invitation.expires_at > now()
  order by invitation.created_at desc
  limit 1;
end;
$$;

create or replace function public.sync_referral_membership_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_email text;
begin
  if new.access_status not in ('onboarding', 'active')
    or old.access_status is not distinct from new.access_status then
    return new;
  end if;

  select lower(account.email)
  into member_email
  from auth.users account
  where account.id = new.id;

  update public.beta_invites invite
  set status = 'accepted',
      accepted_by = new.id,
      accepted_at = coalesce(invite.accepted_at, now())
  from public.referral_invitations referral
  where referral.beta_invite_id = invite.id
    and referral.invitee_email = member_email
    and referral.status = 'approved'
    and invite.status = 'pending'
    and (invite.expires_at is null or invite.expires_at > now());

  update public.referral_invitations referral
  set status = case when new.access_status = 'active' then 'activated' else 'claimed' end,
      referred_user_id = new.id,
      claimed_at = coalesce(referral.claimed_at, now()),
      activated_at = case
        when new.access_status = 'active' then coalesce(referral.activated_at, now())
        else referral.activated_at
      end,
      updated_at = now()
  where referral.invitee_email = member_email
    and referral.status in ('approved', 'claimed')
    and (
      referral.status = 'claimed'
      or referral.expires_at is null
      or referral.expires_at > now()
    );

  return new;
end;
$$;

drop trigger if exists sync_referral_membership_progress_trigger on public.profiles;
create trigger sync_referral_membership_progress_trigger
after update of access_status on public.profiles
for each row execute function public.sync_referral_membership_progress();

create or replace function public.notify_vouched_referral_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  referrer_name text;
  administrator record;
begin
  select coalesce(nullif(trim(profile.display_name), ''), 'A member')
  into referrer_name
  from public.profiles profile
  where profile.id = new.referrer_id;

  for administrator in
    select assignment.user_id
    from public.user_roles assignment
    where assignment.role = 'super_admin'
      and (assignment.expires_at is null or assignment.expires_at > now())
  loop
    perform public.enqueue_notification(
      administrator.user_id,
      'system',
      'A member referral is ready for review',
      referrer_name || ' has vouched for someone to join Her Africa Table.',
      '/admin/operations?area=member-programs#referrals-admin',
      'referral-review:' || new.id || ':' || administrator.user_id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_vouched_referral_submission_trigger
  on public.referral_invitations;
create trigger notify_vouched_referral_submission_trigger
after insert on public.referral_invitations
for each row execute function public.notify_vouched_referral_submission();

create or replace function public.claim_notification_job(p_dedupe_key text)
returns table(
  job_id uuid,
  to_email text,
  template_key text,
  payload jsonb,
  attempt_number smallint,
  dedupe_key text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if nullif(trim(coalesce(p_dedupe_key, '')), '') is null then
    raise exception 'Notification key required';
  end if;

  return query
  with selected as (
    select job.id
    from public.notification_jobs job
    where job.dedupe_key = trim(p_dedupe_key)
      and (
        (job.status = 'queued' and job.next_attempt_at <= now())
        or (job.status = 'processing' and job.locked_at < now() - interval '15 minutes')
      )
    order by job.created_at
    for update skip locked
    limit 1
  ), updated as (
    update public.notification_jobs job
    set status = 'processing',
        attempts = job.attempts + 1,
        locked_at = now(),
        updated_at = now()
    from selected
    where job.id = selected.id
    returning job.*
  )
  select updated.id, updated.to_email, updated.template_key, updated.payload,
    updated.attempts, updated.dedupe_key
  from updated;
end;
$$;

insert into public.referral_campaigns(
  name, slug, description, status, max_referrals_per_member,
  max_total_referrals, created_by
)
select
  'Thoughtful introductions',
  'thoughtful-introductions',
  'Invite an African woman you know and genuinely trust. Every introduction is reviewed privately before an invitation is sent.',
  'active',
  5,
  500,
  account.id
from auth.users account
where lower(account.email) = 'impactedgeinnovations@gmail.com'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  max_referrals_per_member = excluded.max_referrals_per_member,
  max_total_referrals = excluded.max_total_referrals,
  updated_at = now();

update public.feature_flags
set enabled = true,
    updated_by = (
      select account.id from auth.users account
      where lower(account.email) = 'impactedgeinnovations@gmail.com'
      limit 1
    ),
    updated_at = now()
where key = 'referrals';

revoke all on function public.get_my_membership_invitation_context() from public;
grant execute on function public.get_my_membership_invitation_context() to authenticated;
revoke all on function public.claim_notification_job(text) from public;
grant execute on function public.claim_notification_job(text) to service_role;

comment on function public.get_my_membership_invitation_context() is
  'Shows an applicant only the verified invitation context bound to her authenticated email.';
comment on function public.sync_referral_membership_progress() is
  'Keeps vouched-referral tracking accurate through manual approval and member activation.';
comment on function public.claim_notification_job(text) is
  'Claims one exact queued notification so approved invitations can be delivered promptly.';

commit;
