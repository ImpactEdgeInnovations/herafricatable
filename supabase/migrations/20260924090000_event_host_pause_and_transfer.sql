begin;

-- A replacement Host inherits the working draft, but must take responsibility
-- for it and submit it again. Any previously published event content remains
-- public until a new version is approved by Super Admin.
create or replace function public.reset_event_host_draft_on_transfer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.user_id is distinct from new.user_id then
    update public.event_host_workspaces
    set status = 'draft',
        review_note = 'Host access changed. Please review and save the inherited draft before sending it for review.',
        submitted_at = null,
        reviewed_at = null,
        reviewed_by = null,
        updated_at = now()
    where event_id = new.event_id;
  end if;
  return new;
end;
$$;
revoke all on function public.reset_event_host_draft_on_transfer() from public;

drop trigger if exists event_host_transfer_resets_draft on public.event_hosts;
create trigger event_host_transfer_resets_draft
after update of user_id on public.event_hosts
for each row
when (old.user_id is distinct from new.user_id)
execute function public.reset_event_host_draft_on_transfer();

create or replace function public.set_event_host_status(
  p_event_id uuid,
  p_status text,
  p_note text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  target public.event_hosts%rowtype;
  event_title text;
  event_slug text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if p_status not in ('active', 'paused') then
    raise exception 'Choose active or paused';
  end if;
  if p_status = 'paused' and char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Add a clear reason for pausing Host access';
  end if;
  if char_length(trim(coalesce(p_note, ''))) > 500 then
    raise exception 'Keep the Host access note under 500 characters';
  end if;

  select * into target from public.event_hosts
  where event_id = p_event_id for update;
  if not found then raise exception 'Event Host assignment not found'; end if;
  if target.status = p_status then return; end if;

  select title, slug into event_title, event_slug
  from public.events where id = p_event_id;
  update public.event_hosts
  set status = p_status, updated_at = now()
  where event_id = p_event_id;

  perform public.enqueue_notification(
    target.user_id, 'event',
    case when p_status = 'paused'
      then 'Your Event Host access is paused'
      else 'Your Event Host access is restored' end,
    case when p_status = 'paused'
      then event_title || ': ' || trim(p_note)
      else event_title || ': you may return to your private Host workspace.' end,
    case when p_status = 'paused'
      then '/events'
      else '/events/' || event_slug || '/host' end,
    'event-host-status:' || p_event_id || ':' || p_status || ':' || now()
  );

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'event.host_' || p_status, 'event', p_event_id,
    jsonb_build_object('host_id', target.user_id, 'reason', nullif(trim(coalesce(p_note, '')), ''))
  );
end;
$$;
revoke all on function public.set_event_host_status(uuid, text, text) from public;
grant execute on function public.set_event_host_status(uuid, text, text) to authenticated;

create or replace function public.event_host_lifecycle_ready()
returns boolean
language sql stable security definer set search_path = ''
as $$ select true; $$;
revoke all on function public.event_host_lifecycle_ready() from public;
grant execute on function public.event_host_lifecycle_ready() to authenticated;

commit;
