begin;

-- The first Admin decision accepts the idea and creates a private working
-- event. A separate Host-content review is the only path to publication.
create or replace function public.review_member_event_proposal(
  p_proposal_id uuid,
  p_action text,
  p_review_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.member_event_proposals%rowtype;
  saved_venue uuid;
  saved_event uuid;
  saved_slug text;
  host_email text;
  next_status text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin access required';
  end if;
  if p_action not in ('start_review', 'request_changes', 'approve', 'decline') then
    raise exception 'Unsupported review action';
  end if;
  if p_action in ('request_changes', 'decline')
    and char_length(trim(coalesce(p_review_note, ''))) < 10 then
    raise exception 'Add a clear review note';
  end if;

  select * into target from public.member_event_proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'Event proposal not found'; end if;
  if p_action = 'approve' and target.status = 'approved'
    and target.canonical_event_id is not null then
    return target.canonical_event_id;
  end if;
  if target.status not in ('submitted', 'under_review') then
    raise exception 'Only a submitted event proposal can be reviewed';
  end if;

  if p_action = 'approve' then
    if target.audience <> 'public' or target.pricing_mode <> 'free'
      or target.price_minor <> 0 then
      raise exception 'Only free public member events are open for this launch tier';
    end if;
    if target.starts_at < now() + interval '72 hours' then
      raise exception 'The event is too close to approve safely';
    end if;
    if not public.is_active_member(target.proposed_by) then
      raise exception 'The event proposer must remain an active member';
    end if;
    select email into host_email from auth.users where id = target.proposed_by;
    if host_email is null then raise exception 'The event proposer needs a verified account'; end if;

    if target.format in ('in_person', 'hybrid') then
      insert into public.venues(name, city, country, address_line, map_url)
      values (
        trim(target.venue_name), trim(target.city), target.country,
        nullif(trim(coalesce(target.address_line, '')), ''),
        nullif(trim(coalesce(target.map_url, '')), '')
      ) returning id into saved_venue;
    end if;

    saved_slug := lower(regexp_replace(trim(target.title), '[^a-zA-Z0-9]+', '-', 'g'));
    saved_slug := trim(both '-' from saved_slug) || '-' ||
      to_char(target.starts_at at time zone target.timezone, 'YYYY-MM-DD') ||
      '-' || left(target.id::text, 8);

    insert into public.events(
      slug, title, summary, format, status, starts_at, ends_at, timezone,
      venue_id, capacity, registration_mode, is_featured, audience,
      created_by, updated_by
    ) values (
      saved_slug, trim(target.title), trim(target.summary), target.format,
      'draft', target.starts_at, target.ends_at, target.timezone,
      saved_venue, target.capacity, 'manual_review', false, 'public',
      target.proposed_by, actor
    ) returning id into saved_event;

    insert into public.event_private_details(event_id, online_url, check_in_instructions)
    values (
      saved_event,
      nullif(trim(coalesce(target.online_url, '')), ''),
      'Follow the event team instructions. Escalate any safety concern through Her Africa Table support.'
    );

    insert into public.ticket_types(
      event_id, name, description, price_minor, currency, inventory_quantity,
      sales_start_at, sales_end_at, status, sort_order
    ) values (
      saved_event, 'Complimentary place',
      'A complimentary place at this member-hosted public event.',
      0, 'KES', target.capacity, now(), target.starts_at, 'draft', 0
    );

    perform public.assign_event_host(saved_event, host_email);

    update public.member_event_proposals
    set status = 'approved', canonical_event_id = saved_event,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_by = actor, reviewed_at = now(), updated_at = now()
    where id = target.id;

    perform public.enqueue_notification(
      target.proposed_by, 'event', 'Your event idea is approved',
      'Your event is still private. Prepare the details in your Host workspace, then send them to the event team for final review.',
      '/events/' || saved_slug || '/host', 'member-event-approved:' || target.id
    );
    next_status := 'approved';
  else
    next_status := case p_action
      when 'start_review' then 'under_review'
      when 'request_changes' then 'changes_requested'
      else 'declined'
    end;
    update public.member_event_proposals
    set status = next_status,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_by = actor, reviewed_at = now(), updated_at = now()
    where id = target.id;
    if p_action in ('request_changes', 'decline') then
      perform public.enqueue_notification(
        target.proposed_by, 'event',
        case when p_action = 'request_changes'
          then 'Your event proposal needs an update'
          else 'An update on your event proposal'
        end,
        case when p_action = 'request_changes'
          then 'The review team left guidance. Open Events to update and resend your proposal.'
          else 'The review team could not approve this proposal. Open Events to read the decision note.'
        end,
        '/events#propose-event',
        'member-event-review:' || target.id || ':' || next_status
      );
    end if;
    saved_event := null;
  end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'event.member_proposal_' || p_action, 'member_event_proposal', target.id,
    jsonb_build_object(
      'status', next_status, 'canonical_event_id', saved_event,
      'audience', 'public', 'pricing_mode', 'free',
      'community_after_event', target.community_after_event,
      'publication_status', case when p_action = 'approve' then 'private_host_draft' else null end
    )
  );
  return saved_event;
end;
$$;

create or replace function public.member_event_host_handoff_ready()
returns boolean
language sql stable security definer set search_path = ''
as $$ select true; $$;
revoke all on function public.member_event_host_handoff_ready() from public;
grant execute on function public.member_event_host_handoff_ready() to authenticated;

commit;
