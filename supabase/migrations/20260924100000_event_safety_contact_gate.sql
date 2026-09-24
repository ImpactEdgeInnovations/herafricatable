begin;

create table if not exists public.event_safety_contacts (
  event_id uuid primary key references public.events(id) on delete cascade,
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 120),
  contact_phone text not null check (char_length(trim(contact_phone)) between 7 and 40),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.event_safety_contacts enable row level security;
drop policy if exists "Super Admin reads event safety contacts" on public.event_safety_contacts;
create policy "Super Admin reads event safety contacts"
  on public.event_safety_contacts for select to authenticated
  using (public.is_admin(array['super_admin']::public.app_role[]));

-- Existing approved member proposals already contain a named safety contact.
insert into public.event_safety_contacts(event_id, contact_name, contact_phone, updated_by)
select proposal.canonical_event_id, trim(proposal.safety_contact_name),
       trim(proposal.safety_contact_phone), proposal.reviewed_by
from public.member_event_proposals proposal
where proposal.canonical_event_id is not null
on conflict(event_id) do nothing;

create or replace function public.seed_event_safety_contact_from_proposal()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.canonical_event_id is not null
    and new.canonical_event_id is distinct from old.canonical_event_id then
    insert into public.event_safety_contacts(
      event_id, contact_name, contact_phone, updated_by
    ) values (
      new.canonical_event_id, trim(new.safety_contact_name),
      trim(new.safety_contact_phone), new.reviewed_by
    )
    on conflict(event_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.seed_event_safety_contact_from_proposal() from public;
drop trigger if exists member_proposal_seeds_event_safety_contact on public.member_event_proposals;
create trigger member_proposal_seeds_event_safety_contact
after update of canonical_event_id on public.member_event_proposals
for each row
when (new.canonical_event_id is distinct from old.canonical_event_id)
execute function public.seed_event_safety_contact_from_proposal();

create or replace function public.save_event_safety_contact(
  p_event_id uuid,
  p_name text,
  p_phone text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_phone, ''))) not between 7 and 40 then
    raise exception 'Add a safety contact name and reachable phone number';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found';
  end if;
  insert into public.event_safety_contacts(
    event_id, contact_name, contact_phone, updated_by
  ) values (
    p_event_id, trim(p_name), trim(p_phone), auth.uid()
  )
  on conflict(event_id) do update
    set contact_name = excluded.contact_name,
        contact_phone = excluded.contact_phone,
        updated_by = excluded.updated_by,
        updated_at = now();
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), 'event.safety_contact_saved', 'event', p_event_id);
end;
$$;
revoke all on function public.save_event_safety_contact(uuid, text, text) from public;
grant execute on function public.save_event_safety_contact(uuid, text, text) to authenticated;

create or replace function public.require_hosted_event_safety_contact()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'published'
    and exists (select 1 from public.event_hosts where event_id = new.id)
    and not exists (
      select 1 from public.event_safety_contacts where event_id = new.id
    ) then
    raise exception 'Add an event safety contact before publishing';
  end if;
  return new;
end;
$$;
revoke all on function public.require_hosted_event_safety_contact() from public;
drop trigger if exists hosted_event_needs_safety_contact on public.events;
create trigger hosted_event_needs_safety_contact
before update of status on public.events
for each row
when (old.status = 'draft' and new.status = 'published')
execute function public.require_hosted_event_safety_contact();

create or replace function public.event_safety_contact_ready()
returns boolean
language sql stable security definer set search_path = ''
as $$ select true; $$;
revoke all on function public.event_safety_contact_ready() from public;
grant execute on function public.event_safety_contact_ready() to authenticated;

commit;
