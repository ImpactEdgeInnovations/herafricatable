begin;

-- Once a gathering has ended, Host content and table-planning writes close.
-- The report permission below is deliberately separate from edit permission.
create or replace function public.can_host_event(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_hosts host
    join public.profiles profile on profile.id = host.user_id
    join public.events event on event.id = host.event_id
    where host.event_id = p_event_id
      and host.user_id = auth.uid()
      and host.status = 'active'
      and profile.access_status = 'active'
      and event.status in ('draft', 'published')
      and event.ends_at > now()
  );
$$;

-- A Host keeps read-only access to her own completed event. This does not
-- reopen editing, the guest roster, private feedback or payment records.
create or replace function public.can_view_event_host_outcomes(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.event_hosts host
    join public.events event on event.id = host.event_id
    where host.event_id = p_event_id
      and host.user_id = auth.uid()
      and host.status = 'active'
      and public.is_active_member(host.user_id)
      and event.status in ('published', 'completed')
      and event.ends_at < now()
  );
$$;
revoke all on function public.can_view_event_host_outcomes(uuid) from public;
grant execute on function public.can_view_event_host_outcomes(uuid) to authenticated;

create or replace function public.get_my_event_host_workspace(p_slug text)
returns table (
  event_id uuid, event_slug text, event_title text, event_status text,
  starts_at timestamptz, ends_at timestamptz, timezone text,
  workspace_status text, summary text, arrival_info text,
  programme jsonb, partners jsonb, review_note text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select event.id, event.slug::text, event.title::text, event.status::text,
         event.starts_at, event.ends_at, event.timezone::text,
         workspace.status::text, workspace.summary::text,
         workspace.arrival_info::text, workspace.programme,
         workspace.partners, workspace.review_note::text
  from public.events event
  join public.event_hosts host on host.event_id = event.id
  join public.event_host_workspaces workspace on workspace.event_id = event.id
  where event.slug = p_slug
    and host.user_id = auth.uid()
    and (
      public.can_host_event(event.id)
      or public.can_view_event_host_outcomes(event.id)
    );
end;
$$;

-- These figures come directly from source tables. Test accounts are excluded.
-- A Host sees no figures until five real guests have checked in, and each
-- smaller cell remains hidden to avoid disclosing an individual's choice.
create or replace function public.get_event_host_outcomes(p_event_id uuid)
returns table (
  report_ready boolean,
  confirmed_places bigint,
  checked_in bigint,
  feedback_responses bigint,
  community_interest bigint,
  accepted_introductions bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  n_confirmed bigint;
  n_checked bigint;
  n_feedback bigint;
  n_interest bigint;
  n_introductions bigint;
  finished boolean;
begin
  if not public.can_view_event_host_outcomes(p_event_id)
    and not (
      public.is_admin(array['super_admin']::public.app_role[])
      and public.can_manage_event(p_event_id)
    ) then raise exception 'Event outcomes are unavailable'; end if;

  select event.ends_at < now() and event.status in ('published', 'completed')
    into finished from public.events event where event.id = p_event_id;
  if not coalesce(finished, false) then
    return query select false, null::bigint, null::bigint, null::bigint,
                        null::bigint, null::bigint;
    return;
  end if;

  select count(*) into n_confirmed
  from public.event_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.event_id = p_event_id
    and membership.status in ('confirmed', 'attended')
    and not profile.is_test_account;
  select count(*) into n_checked
  from public.event_checkins checkin
  join public.profiles profile on profile.id = checkin.user_id
  where checkin.event_id = p_event_id and checkin.reversed_at is null
    and not profile.is_test_account;
  if n_checked < 5 then
    return query select false, null::bigint, null::bigint, null::bigint,
                        null::bigint, null::bigint;
    return;
  end if;

  select count(*) into n_feedback
  from public.event_feedback feedback
  join public.profiles profile on profile.id = feedback.user_id
  where feedback.event_id = p_event_id and not profile.is_test_account;
  select count(*) into n_interest
  from public.event_follow_up_interests interest
  join public.profiles profile on profile.id = interest.user_id
  where interest.event_id = p_event_id and interest.interested
    and not profile.is_test_account;
  select count(*) into n_introductions
  from public.event_intro_requests request
  join public.profiles first_guest on first_guest.id = request.user_low
  join public.profiles second_guest on second_guest.id = request.user_high
  where request.event_id = p_event_id and request.status = 'accepted'
    and not first_guest.is_test_account and not second_guest.is_test_account;

  return query select true,
    case when n_confirmed >= 5 then n_confirmed end,
    n_checked,
    case when n_feedback >= 5 then n_feedback end,
    case when n_interest >= 5 then n_interest end,
    case when n_introductions >= 5 then n_introductions end;
end;
$$;
revoke all on function public.get_event_host_outcomes(uuid) from public;
grant execute on function public.get_event_host_outcomes(uuid) to authenticated;

comment on function public.get_event_host_outcomes(uuid) is
  'Read-only, small-cell-suppressed after-event totals for the current Host and Super Admin; never returns guest identities, private feedback or test-account activity.';

commit;
