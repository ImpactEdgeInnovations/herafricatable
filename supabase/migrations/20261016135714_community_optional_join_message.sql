begin;
-- Optional request notes are private, not Community posts or email content.

create table if not exists public.community_join_request_notes (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500 and message = btrim(message)),
  updated_at timestamptz not null default now(),
  primary key (community_id,user_id)
);
create index if not exists community_join_request_notes_user on public.community_join_request_notes(user_id);
alter table public.community_join_request_notes enable row level security;
revoke all on public.community_join_request_notes from public, anon, authenticated;
grant select on public.community_join_request_notes to authenticated;
drop policy if exists community_join_request_notes_private_read on public.community_join_request_notes;
create policy community_join_request_notes_private_read on public.community_join_request_notes
for select to authenticated using (
  public.is_active_member((select auth.uid()))
  and (user_id=(select auth.uid()) or public.can_manage_community(community_id))
  and (
    exists(select 1 from public.community_memberships m where m.community_id=community_join_request_notes.community_id
      and m.user_id=community_join_request_notes.user_id and m.status='requested')
    or exists(select 1 from public.community_join_waitlist w where w.community_id=community_join_request_notes.community_id
      and w.user_id=community_join_request_notes.user_id)
  )
);

create or replace function public.join_community_with_message(p_community_id uuid,p_message text default null)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); note text:=nullif(btrim(coalesce(p_message,'')),''); result text;
begin
  if actor is null or not public.is_active_member(actor) then raise exception 'Active membership required' using errcode='42501';end if;
  if char_length(note)>500 then raise exception 'Keep your message to 500 characters or fewer';end if;
  -- Reuse the existing authoritative approval/invitation/payment/capacity flow.
  -- Taking its same lock before the duplicate check also serialises retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_community_id::text||':member-limit',0));
  result:=public.join_community_with_capacity(p_community_id);
  if result in ('requested','waitlisted') and note is not null then
    insert into public.community_join_request_notes(community_id,user_id,message)
    values(p_community_id,actor,note)
    on conflict(community_id,user_id) do update set message=excluded.message,updated_at=now();
  else
    delete from public.community_join_request_notes where community_id=p_community_id and user_id=actor;
  end if;
  -- Do not copy the private message into logs, audit metadata or email.
  return result;
end; $$;
revoke all on function public.join_community_with_message(uuid,text) from public,anon;
grant execute on function public.join_community_with_message(uuid,text) to authenticated;

-- Remove the explanation when it no longer belongs to a pending request.
create or replace function public.clear_resolved_community_join_note()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='community_memberships' then
    if tg_op='DELETE' then
      delete from public.community_join_request_notes where community_id=old.community_id and user_id=old.user_id;
      return old;
    end if;
    if new.status<>'requested' then
      delete from public.community_join_request_notes where community_id=new.community_id and user_id=new.user_id;
    end if;
    return new;
  end if;
  if not exists(select 1 from public.community_memberships m where m.community_id=old.community_id and m.user_id=old.user_id and m.status='requested') then
    delete from public.community_join_request_notes where community_id=old.community_id and user_id=old.user_id;
  end if;
  return old;
end; $$;
revoke all on function public.clear_resolved_community_join_note() from public,anon,authenticated;
drop trigger if exists clear_resolved_community_join_note on public.community_memberships;
create trigger clear_resolved_community_join_note after update of status or delete on public.community_memberships
for each row execute function public.clear_resolved_community_join_note();
drop trigger if exists clear_waiting_community_join_note on public.community_join_waitlist;
create trigger clear_waiting_community_join_note after delete on public.community_join_waitlist
for each row execute function public.clear_resolved_community_join_note();

commit;
