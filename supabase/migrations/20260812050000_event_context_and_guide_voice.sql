begin;

-- A public member event may already belong to a Community. The event remains
-- visible to all approved members after Admin approval; this link simply makes
-- the relationship explicit on both the event and Community pages.
alter table public.member_event_proposals
  add column if not exists community_id uuid
  references public.communities(id) on delete set null;

create index if not exists member_event_proposals_community_idx
  on public.member_event_proposals(community_id, status, updated_at desc);

create or replace function public.set_member_event_proposal_community(
  p_proposal_id uuid,
  p_community_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.is_active_member(actor) then
    raise exception 'Active membership required';
  end if;

  if p_community_id is not null
    and not public.can_manage_community(p_community_id, actor) then
    raise exception 'Choose a Community you own or help host';
  end if;

  update public.member_event_proposals proposal
  set community_id = p_community_id,
      updated_at = now()
  where proposal.id = p_proposal_id
    and proposal.proposed_by = actor
    and proposal.status in ('draft', 'changes_requested');
  if not found then
    raise exception 'Save the event draft before choosing its Community';
  end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor,
    'event.member_proposal_community_changed',
    'member_event_proposal',
    p_proposal_id,
    jsonb_build_object('community_id', p_community_id)
  );
end;
$$;

create or replace function public.list_member_event_proposal_communities()
returns table(
  proposal_id uuid,
  community_id uuid,
  community_name text,
  community_slug text,
  community_type text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  return query
  select proposal.id, community.id, community.name, community.slug,
    community.community_type
  from public.member_event_proposals proposal
  left join public.communities community on community.id = proposal.community_id
  where proposal.proposed_by = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  order by proposal.updated_at desc;
end;
$$;

create or replace function public.link_approved_member_event_to_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved'
    and new.canonical_event_id is not null
    and new.community_id is not null then
    insert into public.community_event_links(
      community_id, event_id, is_featured, linked_by, updated_at
    ) values (
      new.community_id, new.canonical_event_id, false, new.reviewed_by, now()
    )
    on conflict (community_id, event_id) do update
    set updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists member_event_proposal_community_link
  on public.member_event_proposals;
create trigger member_event_proposal_community_link
after insert or update of status, canonical_event_id, community_id
on public.member_event_proposals
for each row execute function public.link_approved_member_event_to_community();

-- Voice playback is member-initiated, rate limited and stores only usage
-- metadata. No question, answer or audio recording is persisted.
create table if not exists public.table_guide_speech_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('success', 'refused', 'error')),
  input_chars integer not null default 0 check (input_chars between 0 and 2000),
  model text check (model is null or char_length(model) between 2 and 100),
  created_at timestamptz not null default now()
);

create index if not exists table_guide_speech_usage_user_created_idx
  on public.table_guide_speech_usage(user_id, created_at desc);

alter table public.table_guide_speech_usage enable row level security;

drop policy if exists "Members read own Table Guide voice usage"
  on public.table_guide_speech_usage;
create policy "Members read own Table Guide voice usage"
  on public.table_guide_speech_usage for select to authenticated
  using (user_id = auth.uid());

create or replace function public.get_my_table_guide_speech_access()
returns table(allowed boolean, remaining_today integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  usage_count bigint;
  opted_in boolean;
begin
  select coalesce(preference.assistant_enabled, false)
  into opted_in
  from (select 1) seed
  left join public.member_ai_preferences preference on preference.user_id = actor;

  select count(*) into usage_count
  from public.table_guide_speech_usage usage
  where usage.user_id = actor
    and usage.created_at >= date_trunc('day', now());

  return query select
    public.is_active_member(actor)
      and public.table_guide_enabled()
      and coalesce(opted_in, false)
      and usage_count < 20,
    greatest(20 - usage_count, 0)::integer;
end;
$$;

create or replace function public.record_table_guide_speech_usage(
  p_status text,
  p_input_chars integer,
  p_model text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('success', 'refused', 'error') then
    raise exception 'Unsupported voice usage status';
  end if;
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active membership required';
  end if;
  insert into public.table_guide_speech_usage(user_id, status, input_chars, model)
  values (
    auth.uid(), p_status, least(greatest(coalesce(p_input_chars, 0), 0), 2000),
    nullif(left(trim(coalesce(p_model, '')), 100), '')
  );
end;
$$;

-- Open availability to approved members. Each member must still opt in, and
-- Super Admin retains the existing platform-wide off switch.
update public.feature_flags
set enabled = true, updated_at = now()
where key = 'table_guide';

revoke all on function public.set_member_event_proposal_community(uuid, uuid)
  from public;
grant execute on function public.set_member_event_proposal_community(uuid, uuid)
  to authenticated;
revoke all on function public.list_member_event_proposal_communities()
  from public;
grant execute on function public.list_member_event_proposal_communities()
  to authenticated;
revoke all on function public.get_my_table_guide_speech_access()
  from public;
grant execute on function public.get_my_table_guide_speech_access()
  to authenticated;
revoke all on function public.record_table_guide_speech_usage(text, integer, text)
  from public;
grant execute on function public.record_table_guide_speech_usage(text, integer, text)
  to authenticated;

comment on column public.member_event_proposals.community_id is
  'Optional existing Community managed by the proposer. Approval links the canonical public event to it.';
comment on table public.table_guide_speech_usage is
  'Privacy-minimised, transcript-free usage metadata for member-initiated Table Guide voice playback.';

commit;
