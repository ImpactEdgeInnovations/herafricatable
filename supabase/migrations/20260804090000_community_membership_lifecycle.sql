begin;

alter table public.community_memberships
  drop constraint if exists community_memberships_status_check;
alter table public.community_memberships
  add constraint community_memberships_status_check
  check (
    status in (
      'requested',
      'invited',
      'approved_pending_payment',
      'active',
      'declined',
      'removed',
      'paused',
      'suspended'
    )
  );

create or replace function public.has_current_community_access(
  p_community_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_access_periods access_period
    where access_period.community_id = p_community_id
      and access_period.user_id = p_user_id
      and access_period.status in ('active', 'grace')
      and access_period.grace_ends_at > now()
  )
$$;

create or replace function public.restore_entitled_community_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved_pending_payment'
    and public.has_current_community_access(new.community_id, new.user_id)
  then
    new.status := 'active';
    new.joined_at := coalesce(new.joined_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists restore_entitled_community_membership_before_write
  on public.community_memberships;
create trigger restore_entitled_community_membership_before_write
before insert or update of status on public.community_memberships
for each row execute function public.restore_entitled_community_membership();

create or replace function public.request_community_access(
  p_community_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.communities%rowtype;
  paid_offer boolean := false;
  current_access boolean := false;
  next_status text;
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor)
  then
    raise exception 'Communities are unavailable';
  end if;

  select * into target
  from public.communities
  where id = p_community_id and status = 'published';
  if not found then raise exception 'Community not found'; end if;

  select exists (
    select 1 from public.community_offers offer
    where offer.community_id = p_community_id
      and offer.status = 'published'
      and offer.access_type = 'paid'
  ) into paid_offer;
  current_access := public.has_current_community_access(p_community_id, actor);

  next_status := case
    when target.community_type = 'private' then 'requested'
    when paid_offer and not current_access then 'approved_pending_payment'
    else 'active'
  end;

  insert into public.community_memberships(
    community_id, user_id, role, status, joined_at
  )
  values(
    p_community_id,
    actor,
    'member',
    next_status,
    case when next_status = 'active' then now() end
  )
  on conflict(community_id, user_id) do update
  set role = 'member',
      status = excluded.status,
      joined_at = case
        when excluded.status = 'active'
          then coalesce(public.community_memberships.joined_at, now())
        else public.community_memberships.joined_at
      end,
      updated_at = now()
  where public.community_memberships.status in ('declined', 'removed');
  if not found then raise exception 'Membership already exists'; end if;

  insert into public.audit_events(
    actor_id, action, target_type, target_id, metadata
  ) values (
    actor,
    'community.membership_' || next_status,
    'community',
    p_community_id,
    jsonb_build_object(
      'status', next_status,
      'paid_offer', paid_offer,
      'existing_access_preserved', current_access
    )
  );
end;
$$;

create or replace function public.manage_my_community_membership(
  p_community_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_memberships%rowtype;
  next_status text;
begin
  if not public.is_active_member(actor) then
    raise exception 'Active membership required';
  end if;
  if p_action not in ('decline_invitation', 'cancel_request', 'leave') then
    raise exception 'Unsupported membership action';
  end if;

  select * into target
  from public.community_memberships
  where community_id = p_community_id and user_id = actor
  for update;
  if not found then raise exception 'Community membership not found'; end if;

  if p_action = 'decline_invitation' and target.status <> 'invited' then
    raise exception 'Invitation is no longer awaiting your response';
  elsif p_action = 'cancel_request'
    and target.status not in ('requested', 'approved_pending_payment')
  then
    raise exception 'There is no pending request to cancel';
  elsif p_action = 'leave' then
    if target.status <> 'active' then
      raise exception 'Active community membership required';
    end if;
    if target.role <> 'member' then
      raise exception 'Community leaders must hand over their role before leaving';
    end if;
  end if;

  next_status := case
    when p_action = 'leave' then 'removed'
    else 'declined'
  end;

  update public.community_memberships
  set status = next_status,
      role = 'member',
      reviewed_by = null,
      updated_at = now()
  where id = target.id;

  update public.community_notification_preferences
  set in_app_replies = false,
      email_replies = false,
      weekly_briefing = false,
      weekly_briefing_email = false,
      updated_at = now()
  where community_id = p_community_id and user_id = actor;

  update public.community_event_reminders
  set status = 'cancelled', updated_at = now()
  where community_id = p_community_id
    and user_id = actor
    and status in ('scheduled', 'queued');

  insert into public.audit_events(
    actor_id, action, target_type, target_id, metadata
  ) values (
    actor,
    'community.membership_' || p_action,
    'community_membership',
    target.id,
    jsonb_build_object(
      'community_id', p_community_id,
      'previous_status', target.status,
      'resulting_status', next_status,
      'member_content_retained', true,
      'paid_access_refund_created', false
    )
  );
end;
$$;

revoke all on function public.has_current_community_access(uuid, uuid) from public;
revoke all on function public.restore_entitled_community_membership() from public;
revoke all on function public.manage_my_community_membership(uuid, text) from public;
grant execute on function public.manage_my_community_membership(uuid, text)
  to authenticated;
revoke all on function public.request_community_access(uuid) from public;
grant execute on function public.request_community_access(uuid) to authenticated;

comment on function public.manage_my_community_membership(uuid, text) is
  'Member-controlled invitation decline, pending-request cancellation and safe departure. Posts and valid paid access periods remain preserved.';

commit;
