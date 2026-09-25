begin;

-- Event-only access continues after the gathering without becoming membership.
-- A pending account must still hold the specific, active event entitlement.
create or replace function public.can_leave_event_feedback(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1
    from public.event_memberships attendance
    join public.events event on event.id = attendance.event_id
    join public.profiles profile on profile.id = attendance.user_id
    where attendance.event_id = p_event_id
      and attendance.user_id = auth.uid()
      and attendance.status in ('confirmed', 'attended')
      and event.status in ('published', 'completed')
      and event.ends_at < now()
      and (
        public.is_active_member(attendance.user_id)
        or (
          profile.access_status = 'pending'
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
revoke all on function public.can_leave_event_feedback(uuid) from public;
grant execute on function public.can_leave_event_feedback(uuid) to authenticated;

create or replace function public.save_event_feedback(
  p_event_id uuid, p_overall integer, p_relevance integer,
  p_connections integer, p_would_recommend boolean,
  p_highlight text, p_improvement text, p_testimonial_quote text,
  p_testimonial_consent text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved uuid;
  consent text := coalesce(p_testimonial_consent, 'none');
  quote text := nullif(trim(p_testimonial_quote), '');
begin
  if not public.can_leave_event_feedback(p_event_id) then
    raise exception 'Confirmed event attendance required';
  end if;
  if p_overall not between 1 and 5 or p_relevance not between 1 and 5
    or p_connections not between 1 and 5 then
    raise exception 'Ratings must be between 1 and 5';
  end if;
  if consent not in ('none', 'anonymous', 'named') then
    raise exception 'Unsupported testimonial consent';
  end if;
  if consent <> 'none' and (quote is null or char_length(quote) < 20) then
    raise exception 'A testimonial quote of at least 20 characters is required';
  end if;
  insert into public.event_feedback(
    event_id, user_id, overall_rating, relevance_rating, connection_rating,
    would_recommend, highlight, improvement, testimonial_quote,
    testimonial_consent, testimonial_status, consent_version
  ) values (
    p_event_id, actor, p_overall, p_relevance, p_connections,
    p_would_recommend, nullif(trim(p_highlight), ''),
    nullif(trim(p_improvement), ''),
    case when consent = 'none' then null else quote end, consent,
    case when consent = 'none' then 'not_requested' else 'pending' end,
    case when consent = 'none' then null else '2026-07-22' end
  )
  on conflict(event_id, user_id) do update set
    overall_rating = excluded.overall_rating,
    relevance_rating = excluded.relevance_rating,
    connection_rating = excluded.connection_rating,
    would_recommend = excluded.would_recommend,
    highlight = excluded.highlight,
    improvement = excluded.improvement,
    testimonial_quote = excluded.testimonial_quote,
    testimonial_consent = excluded.testimonial_consent,
    testimonial_status = case when excluded.testimonial_consent = 'none'
      then 'not_requested' else 'pending' end,
    consent_version = excluded.consent_version,
    updated_at = now()
  returning id into saved;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor, 'event.feedback_saved', 'event_feedback', saved,
          jsonb_build_object('event_id', p_event_id,
                             'testimonial_consent', consent));
  return saved;
end;
$$;

-- A completed public event can still invite a guest to express interest in a
-- follow-up Community. The choice never grants Community or member access.
create or replace function public.can_choose_event_follow_up(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1
    from public.event_memberships attendance
    join public.events event on event.id = attendance.event_id
    join public.profiles profile on profile.id = attendance.user_id
    where attendance.event_id = p_event_id
      and attendance.user_id = auth.uid()
      and attendance.status in ('confirmed', 'attended')
      and event.status in ('published', 'completed')
      and (
        public.is_active_member(attendance.user_id)
        or (
          profile.access_status = 'pending'
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
revoke all on function public.can_choose_event_follow_up(uuid) from public;
grant execute on function public.can_choose_event_follow_up(uuid) to authenticated;

create or replace function public.get_my_event_follow_up_interest(p_event_id uuid)
returns table(available boolean, interested boolean)
language sql stable security definer set search_path = '' as $$
  select
    public.can_choose_event_follow_up(p_event_id)
      and exists (
        select 1 from public.member_event_proposals proposal
        where proposal.canonical_event_id = p_event_id
          and proposal.status = 'approved'
          and proposal.community_after_event
      ),
    coalesce((
      select interest.interested from public.event_follow_up_interests interest
      where interest.event_id = p_event_id and interest.user_id = auth.uid()
    ), false);
$$;

create or replace function public.set_my_event_follow_up_interest(
  p_event_id uuid, p_interested boolean
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  choice_available boolean;
begin
  select choice.available into choice_available
  from public.get_my_event_follow_up_interest(p_event_id) choice;
  if not coalesce(choice_available, false) then
    raise exception 'A confirmed place at this event is required';
  end if;
  insert into public.event_follow_up_interests(
    event_id, user_id, interested, updated_at
  ) values (
    p_event_id, auth.uid(), coalesce(p_interested, false), now()
  ) on conflict(event_id, user_id) do update
    set interested = excluded.interested, updated_at = now();
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.follow_up_interest_changed', 'event', p_event_id,
          jsonb_build_object('interested', coalesce(p_interested, false)));
end;
$$;

-- An anonymous guest quote must not be presented as a member testimonial.
create or replace function public.list_event_testimonials(p_event_id uuid)
returns table(quote text, attribution text)
language sql stable security definer set search_path = '' as $$
  select feedback.testimonial_quote,
    case
      when feedback.testimonial_consent = 'named'
        then coalesce(nullif(trim(profile.display_name), ''), 'Event guest')
      when profile.access_status = 'active' then 'Her Africa Table member'
      else 'Event guest'
    end
  from public.event_feedback feedback
  join public.events event on event.id = feedback.event_id
  left join public.profiles profile on profile.id = feedback.user_id
  where feedback.event_id = p_event_id
    and event.status in ('published', 'completed')
    and event.ends_at < now()
    and feedback.testimonial_status = 'approved'
    and feedback.testimonial_consent in ('anonymous', 'named')
    and feedback.testimonial_quote is not null
  order by feedback.submitted_at desc limit 12;
$$;

commit;
