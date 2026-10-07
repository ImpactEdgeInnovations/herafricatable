begin;

create table public.pilot_event_cancellations (
  event_id uuid primary key references public.events(id) on delete restrict,
  host_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  attendee_message text not null,
  cancelled_at timestamptz not null default now(),
  review_status text not null default 'pending' check (review_status in ('pending','accepted','reopening_requested')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);
alter table public.pilot_event_cancellations enable row level security;
revoke all on public.pilot_event_cancellations from public, anon, authenticated;

create function public.can_cancel_pilot_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.can_self_publish_pilot_event(p_event_id)
    and not exists(select 1 from public.orders o where o.event_id=p_event_id
      and o.total_minor>0 and o.status in ('paid','approved','fulfilled','refund_pending'));
$$;
revoke all on function public.can_cancel_pilot_event(uuid) from public, anon;
grant execute on function public.can_cancel_pilot_event(uuid) to authenticated;

-- Reuse the cancellation transaction, including ticket revocation and notifications.
-- Only the cancel action is extended; suspension and reopening remain Admin-only.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.manage_event_lifecycle(uuid,text,text,text)'::regprocedure);
  if strpos(definition,'if not public.can_manage_event(target.id) then')=0 then
    raise exception 'Unexpected lifecycle function: cancellation extension not applied';
  end if;
  definition := replace(definition,
    'if not public.can_manage_event(target.id) then',
    'if not public.can_manage_event(target.id) and not (p_action = ''cancel'' and public.can_cancel_pilot_event(target.id)) then');
  definition := replace(definition,
    'and not public.is_admin(array[''super_admin'']::public.app_role[]) then',
    'and not public.is_admin(array[''super_admin'']::public.app_role[]) and not (p_action = ''cancel'' and public.can_cancel_pilot_event(target.id)) then');
  execute definition;
end;
$$;

create function public.record_pilot_host_cancellation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare admin_id uuid;
begin
  if new.action <> 'cancelled' or public.is_admin(array['super_admin']::public.app_role[]) then return new; end if;
  insert into public.pilot_event_cancellations(event_id,host_id,reason,attendee_message)
  values(new.event_id,auth.uid(),new.reason,new.member_message);
  for admin_id in select distinct user_id from public.user_roles
    where role='super_admin' and (expires_at is null or expires_at>now())
  loop
    perform public.enqueue_notification(admin_id,'system','A Host cancelled an event',
      new.reason,'/admin/events?event='||new.event_id,'pilot-event-cancelled:'||new.event_id);
  end loop;
  return new;
end;
$$;
revoke all on function public.record_pilot_host_cancellation() from public,anon,authenticated;
create trigger record_pilot_host_cancellation after insert on public.event_lifecycle_events
for each row execute function public.record_pilot_host_cancellation();

create function public.list_pilot_event_cancellations(p_slug text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  return coalesce((select jsonb_agg(row_data order by row_data->>'cancelled_at' desc) from (
    select jsonb_build_object('event_id',e.id,'event_title',e.title,'host_name',p.display_name,
      'reason',c.reason,'attendee_message',c.attendee_message,'cancelled_at',c.cancelled_at,
      'review_status',c.review_status,'review_note',c.review_note) as row_data
    from public.pilot_event_cancellations c join public.events e on e.id=c.event_id
    left join public.profiles p on p.id=c.host_id
    where (c.host_id=auth.uid() or public.is_admin(array['super_admin']::public.app_role[]))
      and (p_slug is null or e.slug=p_slug)
  ) permitted), '[]'::jsonb);
end;
$$;
revoke all on function public.list_pilot_event_cancellations(text) from public,anon;
grant execute on function public.list_pilot_event_cancellations(text) to authenticated;

create function public.review_pilot_event_cancellation(p_event_id uuid,p_decision text,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.pilot_event_cancellations%rowtype;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super Admin required'; end if;
  if p_decision not in ('accepted','reopening_requested') or length(trim(coalesce(p_note,''))) not between 10 and 1000 then
    raise exception 'Choose a review decision and explain it'; end if;
  select * into target from public.pilot_event_cancellations where event_id=p_event_id for update;
  if not found or target.review_status <> 'pending' then raise exception 'This cancellation has already been reviewed'; end if;
  update public.pilot_event_cancellations set review_status=p_decision,review_note=trim(p_note),
    reviewed_by=auth.uid(),reviewed_at=now() where event_id=p_event_id;
  perform public.enqueue_notification(target.host_id,'system',
    case when p_decision='accepted' then 'Your event cancellation was reviewed' else 'Please propose a new plan for your event' end,
    trim(p_note)||' The event stays cancelled. Previous tickets will not be restored.',
    '/events','pilot-cancellation-review:'||p_event_id);
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'event.host_cancellation_reviewed','event',p_event_id,jsonb_build_object('decision',p_decision,'note',trim(p_note)));
end;
$$;
revoke all on function public.review_pilot_event_cancellation(uuid,text,text) from public,anon;
grant execute on function public.review_pilot_event_cancellation(uuid,text,text) to authenticated;

commit;
