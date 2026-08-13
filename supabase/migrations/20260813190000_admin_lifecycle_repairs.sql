begin;

-- The original function returned auth.users.email as varchar(255) while its
-- declared result is text. PostgreSQL correctly rejected the whole Admin
-- Community application queue at runtime.
create or replace function public.list_community_host_applications_admin()
returns table(
  application_id uuid,
  applicant_id uuid,
  applicant_name text,
  applicant_email text,
  community_name text,
  proposed_slug text,
  category text,
  purpose text,
  intended_members text,
  expected_members integer,
  admission_model text,
  host_experience text,
  safety_plan text,
  applicant_message text,
  status text,
  admin_note text,
  submitted_at timestamptz,
  updated_at timestamptz,
  reviewed_by_name text,
  reviewed_at timestamptz,
  created_community_id uuid,
  created_community_slug text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;

  return query
  select
    application.id,
    application.applicant_id,
    coalesce(applicant.display_name, applicant_user.email::text, 'Member'),
    applicant_user.email::text,
    application.community_name,
    application.proposed_slug,
    application.category,
    application.purpose,
    application.intended_members,
    application.expected_members,
    application.admission_model,
    application.host_experience,
    application.safety_plan,
    application.applicant_message,
    application.status,
    application.admin_note,
    application.submitted_at,
    application.updated_at,
    reviewer.display_name,
    application.reviewed_at,
    application.created_community_id,
    community.slug
  from public.community_host_applications application
  join auth.users applicant_user on applicant_user.id = application.applicant_id
  left join public.profiles applicant on applicant.id = application.applicant_id
  left join public.profiles reviewer on reviewer.id = application.reviewed_by
  left join public.communities community
    on community.id = application.created_community_id
  order by
    case application.status
      when 'pending' then 0
      when 'under_review' then 1
      when 'changes_requested' then 2
      else 3
    end,
    application.submitted_at;
end;
$$;

-- A paused owner is intentionally suspended. Reopening must accept that
-- preserved owner state, then reactivate the roster after release checks.
create or replace function public.manage_community_lifecycle(
  p_community_id uuid,
  p_action text,
  p_reason text,
  p_successor_membership_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.communities%rowtype;
  successor public.community_memberships%rowtype;
  affected integer := 0;
  member_record record;
  event_action text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_action not in ('pause', 'replace_host', 'reopen', 'close') then
    raise exception 'Unsupported Community lifecycle action';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'A clear operational reason is required';
  end if;

  select * into target from public.communities
  where id = p_community_id for update;
  if not found then raise exception 'Community not found'; end if;

  if p_action = 'replace_host' then
    select * into successor
    from public.community_memberships
    where id = p_successor_membership_id
      and community_id = p_community_id
      and status in ('active', 'paused', 'suspended')
      and role <> 'owner'
    for update;
    if not found then
      raise exception 'Choose an existing member or moderator as the successor';
    end if;
    update public.community_memberships
    set role = 'member',
        status = case when status = 'suspended' then 'paused' else status end,
        updated_at = now()
    where community_id = p_community_id and role = 'owner';
    update public.community_memberships
    set role = 'owner', status = 'active', reviewed_by = actor, updated_at = now()
    where id = successor.id;
    event_action := 'host_replaced';
    perform public.enqueue_notification(
      successor.user_id, 'community', 'You are now the Community host',
      'Ownership was transferred by Her Africa Table. Open Host tools to review the room before continuing.',
      '/communities',
      'community-host-replaced:' || p_community_id || ':' || successor.user_id
    );
  elsif p_action = 'pause' then
    if target.status <> 'published' then
      raise exception 'Only an open Community can be paused';
    end if;
    update public.communities set status = 'draft', updated_at = now()
    where id = p_community_id;
    update public.community_memberships
    set status = case when role = 'owner' then 'suspended' else 'paused' end,
        updated_at = now()
    where community_id = p_community_id
      and status = 'active'
      and role <> 'moderator';
    get diagnostics affected = row_count;
    event_action := 'paused';
  elsif p_action = 'reopen' then
    if target.status <> 'draft' then
      raise exception 'Only a paused Community can be reopened';
    end if;
    if not exists (
      select 1 from public.community_memberships
      where community_id = p_community_id
        and role = 'owner'
        and status in ('active', 'suspended')
    ) or not exists (
      select 1 from public.community_memberships
      where community_id = p_community_id
        and role = 'moderator'
        and status = 'active'
    ) then
      raise exception 'A preserved owner and active backup moderator are required';
    end if;
    update public.community_memberships
    set status = 'active', updated_at = now()
    where community_id = p_community_id and status in ('paused', 'suspended');
    get diagnostics affected = row_count;
    if not public.community_release_ready(p_community_id) then
      raise exception 'Community release acceptance must pass before reopening';
    end if;
    update public.communities set status = 'published', updated_at = now()
    where id = p_community_id;
    event_action := 'reopened';
  else
    if target.status = 'archived' then
      raise exception 'This Community is already closed';
    end if;
    update public.communities set status = 'archived', updated_at = now()
    where id = p_community_id;
    update public.community_memberships
    set status = case when role in ('owner', 'moderator') then 'suspended' else 'paused' end,
        updated_at = now()
    where community_id = p_community_id and status = 'active';
    get diagnostics affected = row_count;
    event_action := 'closed';
  end if;

  if p_action in ('pause', 'reopen', 'close') then
    for member_record in
      select membership.user_id
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.status in ('active', 'paused', 'suspended')
        and membership.user_id <> actor
    loop
      perform public.enqueue_notification(
        member_record.user_id,
        'community',
        case p_action
          when 'pause' then target.name || ' is temporarily paused'
          when 'reopen' then target.name || ' has reopened'
          else target.name || ' has closed'
        end,
        case p_action
          when 'pause' then 'Conversations and member access are preserved while the Her Africa Table team supports the host transition.'
          when 'reopen' then 'Your membership and previous contributions are available again.'
          else 'The room is closed to new activity. Existing records remain preserved under the platform retention policy.'
        end,
        '/communities',
        'community-lifecycle:' || p_community_id || ':' || event_action || ':' || member_record.user_id
      );
    end loop;
  end if;

  insert into public.community_lifecycle_events(
    community_id, action, reason, previous_status, successor_user_id,
    affected_member_count, created_by
  ) values (
    p_community_id, event_action, trim(p_reason), target.status,
    successor.user_id, affected, actor
  );
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(
    actor, 'community.lifecycle_' || event_action, 'community', p_community_id,
    jsonb_build_object(
      'previous_status', target.status,
      'successor_user_id', successor.user_id,
      'affected_member_count', affected
    )
  );
end;
$$;

alter table public.events drop constraint if exists events_status_check;
alter table public.events
  add constraint events_status_check
  check (status in ('draft', 'published', 'suspended', 'cancelled', 'completed'));

create or replace function public.enforce_event_lifecycle_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('suspended', 'cancelled')
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
    and coalesce(current_setting('hat.event_lifecycle_action', true), '') <> 'true'
  then
    raise exception 'Use the audited Event oversight lifecycle action';
  end if;
  if tg_op = 'UPDATE'
    and old.status in ('suspended', 'cancelled')
    and new.status is distinct from old.status
    and coalesce(current_setting('hat.event_lifecycle_action', true), '') <> 'true'
  then
    raise exception 'Use Event oversight for protected Event lifecycle changes';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_event_lifecycle_transition_trigger
  on public.events;
create trigger enforce_event_lifecycle_transition_trigger
before insert or update of status on public.events
for each row execute function public.enforce_event_lifecycle_transition();

create table if not exists public.event_lifecycle_state (
  event_id uuid primary key references public.events(id) on delete cascade,
  active_action text not null
    check (active_action in ('registrations_paused', 'suspended')),
  prior_status text not null
    check (prior_status in ('draft', 'published')),
  prior_registration_mode text not null
    check (prior_registration_mode in ('automatic', 'manual_review', 'closed', 'waitlist')),
  reason text not null check (char_length(trim(reason)) between 10 and 1000),
  member_message text,
  acted_by uuid references auth.users(id) on delete set null,
  acted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  action text not null check (
    action in (
      'registrations_paused',
      'registrations_reopened',
      'suspended',
      'reopened',
      'cancelled'
    )
  ),
  reason text not null check (char_length(trim(reason)) between 10 and 1000),
  member_message text,
  previous_status text not null,
  previous_registration_mode text not null,
  affected_registration_count integer not null default 0,
  refund_review_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists event_lifecycle_events_event_created_idx
  on public.event_lifecycle_events(event_id, created_at desc);

alter table public.event_lifecycle_state enable row level security;
alter table public.event_lifecycle_events enable row level security;

drop policy if exists "Event teams read active lifecycle state"
  on public.event_lifecycle_state;
create policy "Event teams read active lifecycle state"
  on public.event_lifecycle_state for select to authenticated
  using (public.can_manage_event(event_id));

drop policy if exists "Event teams read lifecycle history"
  on public.event_lifecycle_events;
create policy "Event teams read lifecycle history"
  on public.event_lifecycle_events for select to authenticated
  using (public.can_manage_event(event_id));

create or replace function public.list_event_lifecycle_admin()
returns table(
  event_id uuid,
  active_action text,
  prior_status text,
  prior_registration_mode text,
  reason text,
  member_message text,
  acted_by_name text,
  acted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(
    array['super_admin', 'event_staff']::public.app_role[]
  ) then
    raise exception 'Event team access required';
  end if;

  return query
  select
    state.event_id,
    state.active_action,
    state.prior_status,
    state.prior_registration_mode,
    state.reason,
    state.member_message,
    profile.display_name,
    state.acted_at
  from public.event_lifecycle_state state
  left join public.profiles profile on profile.id = state.acted_by
  where public.can_manage_event(state.event_id)
  order by state.acted_at desc;
end;
$$;

create or replace function public.manage_event_lifecycle(
  p_event_id uuid,
  p_action text,
  p_reason text,
  p_member_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.events%rowtype;
  active_state public.event_lifecycle_state%rowtype;
  clean_reason text := trim(coalesce(p_reason, ''));
  clean_message text := nullif(trim(coalesce(p_member_message, '')), '');
  affected integer := 0;
  refund_count integer := 0;
  recipient uuid;
  order_row public.orders%rowtype;
  next_action text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_action not in (
    'pause_registrations', 'resume_registrations', 'suspend', 'reopen', 'cancel'
  ) then
    raise exception 'Unsupported event lifecycle action';
  end if;
  if char_length(clean_reason) not between 10 and 1000 then
    raise exception 'A clear operational reason is required';
  end if;
  if p_action in ('suspend', 'reopen', 'cancel')
    and char_length(coalesce(clean_message, '')) not between 20 and 800 then
    raise exception 'Add a clear message for the Host and guests';
  end if;

  select * into target from public.events
  where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not public.can_manage_event(target.id) then
    raise exception 'You are not authorized to manage this event';
  end if;
  if p_action in ('suspend', 'reopen', 'cancel')
    and not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin access required';
  end if;
  perform set_config('hat.event_lifecycle_action', 'true', true);

  select * into active_state from public.event_lifecycle_state
  where event_id = target.id for update;

  if p_action = 'pause_registrations' then
    if target.status <> 'published' then
      raise exception 'Only a published event can pause registrations';
    end if;
    if target.registration_mode = 'closed' then
      raise exception 'Registration is already closed';
    end if;
    insert into public.event_lifecycle_state(
      event_id, active_action, prior_status, prior_registration_mode,
      reason, member_message, acted_by, acted_at, updated_at
    ) values (
      target.id, 'registrations_paused', target.status,
      target.registration_mode, clean_reason, clean_message, actor, now(), now()
    )
    on conflict(event_id) do update set
      active_action = excluded.active_action,
      prior_status = excluded.prior_status,
      prior_registration_mode = excluded.prior_registration_mode,
      reason = excluded.reason,
      member_message = excluded.member_message,
      acted_by = excluded.acted_by,
      acted_at = now(),
      updated_at = now();
    update public.events set registration_mode = 'closed',
      updated_by = actor, updated_at = now() where id = target.id;
    next_action := 'registrations_paused';

  elsif p_action = 'resume_registrations' then
    if target.status <> 'published'
      or active_state.active_action <> 'registrations_paused' then
      raise exception 'This event does not have an Admin registration pause';
    end if;
    update public.events
    set registration_mode = active_state.prior_registration_mode,
        updated_by = actor, updated_at = now()
    where id = target.id;
    delete from public.event_lifecycle_state where event_id = target.id;
    next_action := 'registrations_reopened';

  elsif p_action = 'suspend' then
    if target.status <> 'published' then
      raise exception 'Only a published event can be suspended';
    end if;
    insert into public.event_lifecycle_state(
      event_id, active_action, prior_status, prior_registration_mode,
      reason, member_message, acted_by, acted_at, updated_at
    ) values (
      target.id, 'suspended', target.status,
      case
        when active_state.active_action = 'registrations_paused'
          then active_state.prior_registration_mode
        else target.registration_mode
      end,
      clean_reason, clean_message, actor, now(), now()
    )
    on conflict(event_id) do update set
      active_action = excluded.active_action,
      prior_status = excluded.prior_status,
      prior_registration_mode = excluded.prior_registration_mode,
      reason = excluded.reason,
      member_message = excluded.member_message,
      acted_by = excluded.acted_by,
      acted_at = now(),
      updated_at = now();
    update public.events
    set status = 'suspended', registration_mode = 'closed',
        is_featured = false, updated_by = actor, updated_at = now()
    where id = target.id;
    update public.site_event_countdown set is_published = false,
      updated_by = actor, updated_at = now()
    where id = true and event_name = target.title;
    next_action := 'suspended';

  elsif p_action = 'reopen' then
    if target.status <> 'suspended'
      or active_state.active_action <> 'suspended' then
      raise exception 'This event does not have an active suspension';
    end if;
    if target.ends_at <= now() then
      raise exception 'A past event cannot be reopened';
    end if;
    update public.events
    set status = 'published',
        registration_mode = active_state.prior_registration_mode,
        updated_by = actor, updated_at = now()
    where id = target.id;
    delete from public.event_lifecycle_state where event_id = target.id;
    next_action := 'reopened';

  else
    if target.status in ('cancelled', 'completed') then
      raise exception 'This event can no longer be cancelled here';
    end if;

    for order_row in
      select * from public.orders
      where event_id = target.id
        and status in (
          'pending_payment', 'pending_review', 'paid', 'approved', 'fulfilled'
        )
      for update
    loop
      if order_row.status in ('paid', 'approved', 'fulfilled')
        and order_row.total_minor > 0 then
        insert into public.refund_requests(order_id, user_id, reason)
        values (
          order_row.id,
          order_row.user_id,
          'Event cancelled by Her Africa Table: ' || left(clean_message, 900)
        )
        on conflict(order_id) do nothing;
        update public.orders set status = 'refund_pending', updated_at = now()
        where id = order_row.id and status <> 'refunded';
        refund_count := refund_count + 1;
      else
        update public.orders set status = 'cancelled', updated_at = now()
        where id = order_row.id;
      end if;
    end loop;

    update public.registration_requests
    set status = 'cancelled', updated_at = now()
    where event_id = target.id and status not in ('rejected', 'cancelled');
    get diagnostics affected = row_count;
    update public.manual_payment_reviews review
    set status = 'rejected', reviewer_id = actor,
        reviewer_note = 'Event cancelled before review was completed.',
        reviewed_at = now(), updated_at = now()
    where review.status = 'pending'
      and exists (
        select 1 from public.orders order_record
        where order_record.id = review.order_id
          and order_record.event_id = target.id
      );
    update public.event_memberships set status = 'cancelled', updated_at = now()
    where event_id = target.id and status <> 'cancelled';
    update public.entitlements set status = 'revoked', revoked_at = now()
    where event_id = target.id and status = 'active';
    update public.events
    set status = 'cancelled', registration_mode = 'closed',
        is_featured = false, updated_by = actor, updated_at = now()
    where id = target.id;
    update public.site_event_countdown set is_published = false,
      updated_by = actor, updated_at = now()
    where id = true and event_name = target.title;
    delete from public.event_lifecycle_state where event_id = target.id;
    next_action := 'cancelled';
  end if;

  if next_action in ('suspended', 'reopened', 'cancelled') then
    for recipient in
      select distinct candidate.user_id
      from (
        select target.created_by as user_id
        union all
        select registration.user_id
        from public.registration_requests registration
        where registration.event_id = target.id
        union all
        select membership.user_id
        from public.event_memberships membership
        where membership.event_id = target.id
      ) candidate
      where candidate.user_id is not null and candidate.user_id <> actor
    loop
      perform public.enqueue_notification(
        recipient,
        'event',
        case next_action
          when 'suspended' then target.title || ' is temporarily paused'
          when 'reopened' then target.title || ' is open again'
          else target.title || ' has been cancelled'
        end,
        clean_message,
        case when next_action = 'reopened'
          then '/events/' || target.slug else '/events' end,
        'event-lifecycle:' || target.id || ':' || next_action || ':' || recipient
      );
    end loop;
  end if;

  insert into public.event_lifecycle_events(
    event_id, action, reason, member_message, previous_status,
    previous_registration_mode, affected_registration_count,
    refund_review_count, created_by
  ) values (
    target.id, next_action, clean_reason, clean_message, target.status,
    target.registration_mode, affected, refund_count, actor
  );

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor,
    'event.lifecycle_' || next_action,
    'event',
    target.id,
    jsonb_build_object(
      'reason', clean_reason,
      'previous_status', target.status,
      'previous_registration_mode', target.registration_mode,
      'affected_registrations', affected,
      'refund_reviews', refund_count
    )
  );
end;
$$;

-- A late payment must never restore access to a suspended or cancelled event.
create or replace function public.fulfill_registration_order(
  p_order_id uuid,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.orders%rowtype;
  ticket_id uuid;
  event_status text;
begin
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if target.status = 'fulfilled' then return; end if;
  if target.status not in ('paid', 'approved') then
    raise exception 'Order is not approved for fulfillment';
  end if;

  select status into event_status from public.events where id = target.event_id;
  if event_status <> 'published' then
    if target.total_minor > 0 then
      insert into public.refund_requests(order_id, user_id, reason)
      values (
        target.id,
        target.user_id,
        'Payment completed while the event was unavailable. Refund review is required.'
      )
      on conflict(order_id) do nothing;
      update public.orders set status = 'refund_pending', updated_at = now()
      where id = target.id;
    else
      update public.orders set status = 'cancelled', updated_at = now()
      where id = target.id;
    end if;
    update public.registration_requests set status = 'cancelled', updated_at = now()
    where order_id = target.id;
    return;
  end if;

  select ticket_type_id into ticket_id from public.order_items
  where order_id = p_order_id order by id limit 1;
  insert into public.event_memberships(
    event_id, user_id, order_id, ticket_type_id, status, confirmed_at
  ) values (
    target.event_id, target.user_id, target.id, ticket_id, 'confirmed', now()
  )
  on conflict(event_id, user_id) do update
  set status = 'confirmed', confirmed_at = now(), updated_at = now();
  insert into public.entitlements(
    user_id, event_id, order_id, entitlement_type, metadata
  ) values (
    target.user_id, target.event_id, target.id, 'event_access',
    jsonb_build_object('source', p_source)
  ) on conflict(user_id, event_id, entitlement_type) do nothing;
  insert into public.entitlements(
    user_id, event_id, order_id, entitlement_type, metadata
  ) values (
    target.user_id, target.event_id, target.id, 'member_onboarding',
    jsonb_build_object('source', p_source)
  ) on conflict(user_id, event_id, entitlement_type) do nothing;
  update public.registration_requests set status = 'approved', updated_at = now()
  where order_id = p_order_id;
  update public.profiles set access_status = 'onboarding', updated_at = now()
  where id = target.user_id and access_status = 'pending';
  update public.orders set status = 'fulfilled', fulfilled_at = now(), updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function public.review_manual_registration(
  p_order_id uuid,
  p_action text,
  p_reviewer_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  event_id uuid;
  event_status text;
begin
  select orders.event_id into event_id
  from public.orders
  where id = p_order_id and processing_mode = 'manual_review'
  for update;
  if actor is null or event_id is null or not public.can_manage_event(event_id) then
    raise exception 'Not authorized';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'Unsupported review action';
  end if;
  select status into event_status from public.events where id = event_id;
  if p_action = 'approve' and event_status <> 'published' then
    raise exception 'Registration cannot be approved while the event is unavailable';
  end if;

  update public.manual_payment_reviews
  set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
      reviewer_id = actor,
      reviewer_note = nullif(trim(p_reviewer_note), ''),
      reviewed_at = now(), updated_at = now()
  where order_id = p_order_id and status = 'pending';
  if not found then raise exception 'Pending manual review not found'; end if;

  update public.orders
  set status = case when p_action = 'approve' then 'approved' else 'cancelled' end,
      updated_at = now()
  where id = p_order_id;
  if p_action = 'reject' then
    update public.registration_requests set status = 'rejected', updated_at = now()
    where order_id = p_order_id;
  else
    perform public.fulfill_registration_order(p_order_id, 'manual_review');
  end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'registration.manual_' || p_action, 'order', p_order_id,
    jsonb_build_object(
      'event_id', event_id,
      'reviewer_note', nullif(trim(p_reviewer_note), '')
    )
  );
end;
$$;

revoke all on function public.list_event_lifecycle_admin() from public;
grant execute on function public.list_event_lifecycle_admin() to authenticated;
revoke all on function public.manage_event_lifecycle(uuid, text, text, text) from public;
grant execute on function public.manage_event_lifecycle(uuid, text, text, text) to authenticated;

comment on function public.manage_event_lifecycle(uuid, text, text, text) is
  'Audited Event registration pause, suspension, reopening and cancellation with guest notices and refund-safe cancellation.';

commit;
