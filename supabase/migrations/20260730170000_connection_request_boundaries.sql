begin;

create or replace function public.enforce_connection_request_boundaries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  outstanding_count integer;
  daily_count integer;
begin
  if new.status <> 'pending'
    or (tg_op = 'UPDATE' and old.status = 'pending')
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and (
      (old.status = 'ignored' and old.updated_at > now() - interval '30 days')
      or (
        old.status = 'cancelled'
        and old.updated_at > now() - interval '7 days'
      )
    )
  then
    raise exception 'Please wait before requesting this connection again';
  end if;

  select count(*)
  into outstanding_count
  from public.connections connection
  where connection.requester_id = new.requester_id
    and connection.status = 'pending'
    and (tg_op = 'INSERT' or connection.id <> new.id);

  if outstanding_count >= 10 then
    raise exception 'Outstanding connection request limit reached';
  end if;

  select count(*)
  into daily_count
  from public.audit_events event
  where event.actor_id = new.requester_id
    and event.action = 'connection.requested'
    and event.created_at > now() - interval '24 hours';

  if daily_count >= 20 then
    raise exception 'Daily connection request limit reached';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_connection_request_boundaries
  on public.connections;
create trigger enforce_connection_request_boundaries
before insert or update of status, requester_id, recipient_id
on public.connections
for each row
execute function public.enforce_connection_request_boundaries();

revoke all on function public.enforce_connection_request_boundaries() from public;

commit;
