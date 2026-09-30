begin;

-- A manual event request needs a human decision. Alert Super Admin through the
-- existing in-app and Resend queues without exposing the attendee's note or
-- email in the notification. Reapplying after cancellation has a new order ID.
create or replace function public.notify_event_registration_review()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  admin_id uuid;
  event_title text;
  order_reference text;
begin
  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.order_id is not distinct from new.order_id then
    return new;
  end if;

  select title into event_title from public.events where id = new.event_id;
  if new.status = 'pending_review' and new.order_id is not null then
    for admin_id in
      select distinct role.user_id
      from public.user_roles role
      join public.profiles profile on profile.id = role.user_id
      where role.role = 'super_admin'
        and profile.access_status = 'active'
        and role.user_id <> new.user_id
    loop
      perform public.enqueue_notification(
        admin_id, 'registration', 'New event place request',
        'A guest requested a place at ' || coalesce(event_title, 'an event') ||
          '. Review it in Events → Registrations.',
        '/admin/events?view=registrations',
        'event-registration-review:' || new.order_id
      );
    end loop;
  elsif new.status = 'rejected' and new.order_id is not null then
    select reference into order_reference
    from public.orders where id = new.order_id;
    perform public.enqueue_notification(
      new.user_id, 'registration', 'Your event request was declined',
      'Your request for ' || coalesce(event_title, 'this event') ||
        ' was not approved. Contact the event team if you need help.',
      case when order_reference is null then '/events'
        else '/orders/' || order_reference end,
      'event-registration-declined:' || new.order_id
    );
  end if;
  return new;
end;
$$;
revoke all on function public.notify_event_registration_review() from public;
drop trigger if exists notify_event_registration_review on public.registration_requests;
create trigger notify_event_registration_review
after insert or update of status, order_id on public.registration_requests
for each row execute function public.notify_event_registration_review();

-- Keep non-event commerce unchanged. For events, avoid sending an internal
-- 'approved' or 'paid' step before the actual confirmed pass exists. A
-- declined request is reported by the registration trigger above rather than
-- as the ambiguous order status 'cancelled'.
create or replace function public.notify_order_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  item_title text;
  target_href text;
  notice_title text;
  notice_body text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.order_type = 'event' then
    select title into item_title from public.events where id = new.event_id;
    item_title := coalesce(item_title, 'your event');
    target_href := '/orders/' || new.reference;
    case new.status
      when 'pending_review' then
        notice_title := 'We have your event request';
        notice_body := 'We received your request for a place at ' || item_title ||
          '. It is not confirmed yet. We will email you after the event team reviews it.';
      when 'pending_payment' then
        notice_title := 'Complete your event payment';
        notice_body := 'Your place at ' || item_title ||
          ' is not confirmed yet. Open your order to complete payment before the reservation expires.';
      when 'fulfilled' then
        notice_title := 'Your event place is confirmed';
        notice_body := 'Your place at ' || item_title ||
          ' is confirmed. Open your order to view your private pass and arrival details.';
      when 'expired' then
        notice_title := 'Your event reservation expired';
        notice_body := 'The payment window for ' || item_title ||
          ' has closed. Open your order for the current status.';
      when 'refund_pending' then
        notice_title := 'Your event refund needs review';
        notice_body := 'A refund for ' || item_title ||
          ' needs review. We will update you when it is resolved.';
      when 'refunded' then
        notice_title := 'Your event refund was recorded';
        notice_body := 'The refund for ' || item_title ||
          ' has been recorded. Open your order for details.';
      else
        return new;
    end case;
  elsif new.order_type = 'course' then
    select course.title, '/learning/' || course.slug into item_title, target_href
    from public.order_items item
    join public.courses course on course.id = item.course_id
    where item.order_id = new.id;
  elsif new.order_type = 'membership' then
    select plan.name, '/membership' into item_title, target_href
    from public.order_items item
    join public.membership_plans plan on plan.id = item.membership_plan_id
    where item.order_id = new.id;
  elsif new.order_type = 'community' then
    select community.name, '/communities' into item_title, target_href
    from public.order_items item
    join public.community_offers offer on offer.id = item.community_offer_id
    join public.communities community on community.id = offer.community_id
    where item.order_id = new.id;
  else
    select plan.name, '/communities/' || community.slug || '/host#commerce'
    into item_title, target_href
    from public.community_host_plan_orders context
    join public.community_host_plans plan on plan.id = context.plan_id
    join public.communities community on community.id = context.community_id
    where context.order_id = new.id;
  end if;

  perform public.enqueue_notification(
    new.user_id, 'registration',
    coalesce(notice_title, case new.order_type
      when 'membership' then 'Membership update'
      when 'course' then 'Learning order update'
      when 'community' then 'Community access update'
      when 'community_host_plan' then 'Host plan update'
      else 'Registration update' end),
    coalesce(notice_body, coalesce(item_title, 'Your order') || ' is now ' ||
      replace(new.status, '_', ' ') || '.'),
    coalesce(target_href, '/orders/' || new.reference),
    'order-status:' || new.id || ':' || new.status
  );
  return new;
end;
$$;

create or replace function public.event_registration_notification_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.registration_requests'::pg_catalog.regclass
      and trigger_row.tgname = 'notify_event_registration_review'
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgfoid =
        'public.notify_event_registration_review()'::pg_catalog.regprocedure
  );
$$;
revoke all on function public.event_registration_notification_ready() from public;
grant execute on function public.event_registration_notification_ready()
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
