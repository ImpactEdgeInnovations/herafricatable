begin;
-- Ordered after the existing joining-policy migration.

-- Pilot publication is a separate, auditable release route, never fabricated
-- acceptance evidence. Ordinary and paid Communities keep the existing gate.
create table if not exists public.community_pilot_publications (
  community_id uuid primary key references public.communities(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  application_id uuid not null references public.community_host_applications(id),
  opened_at timestamptz not null default now()
);
alter table public.community_pilot_publications enable row level security;
revoke all on public.community_pilot_publications from public, anon, authenticated;
alter table public.communities add column if not exists join_policy text not null default 'approval'
  check (join_policy in ('open','approval','invite_only'));

alter function public.community_release_ready(uuid) rename to community_release_ready_standard;
revoke all on function public.community_release_ready_standard(uuid) from public, anon, authenticated;
create or replace function public.community_release_ready(p_community_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.community_release_ready_standard(p_community_id) or exists (
    select 1 from public.community_pilot_publications pilot
    join public.community_host_applications application on application.id = pilot.application_id
    join public.community_memberships member on member.community_id = pilot.community_id
      and member.user_id = pilot.owner_id and member.role = 'owner' and member.status = 'active'
    where pilot.community_id = p_community_id
      and application.pilot_auto_draft and application.status = 'approved'
      and application.created_community_id = p_community_id
      and not exists (select 1 from public.community_offers offer
        where offer.community_id = p_community_id and offer.access_type = 'paid'
          and offer.status = 'published')
  );
$$;
revoke all on function public.community_release_ready(uuid) from public, anon;
grant execute on function public.community_release_ready(uuid) to authenticated;

create or replace function public.open_my_pilot_community(p_community_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare application public.community_host_applications%rowtype; host_name text;
begin
  if not public.community_pilot_member_ready(auth.uid()) then
    raise exception 'Automatic Community opening is paused or your founding pilot place is unavailable';
  end if;
  perform 1 from public.communities where id = p_community_id and status = 'draft' for update;
  if not found then raise exception 'Choose your private Community draft'; end if;
  select a.* into application from public.community_host_applications a
    join public.community_memberships member on member.community_id = a.created_community_id
      and member.user_id = auth.uid() and member.role = 'owner' and member.status = 'active'
    where a.created_community_id = p_community_id and a.applicant_id = auth.uid()
      and a.pilot_auto_draft and a.status = 'approved';
  if not found or application.guidelines_accepted_at is null
    or char_length(trim(application.safety_plan)) < 20 then
    raise exception 'Complete your Community purpose and safety steps first';
  end if;
  if exists (select 1 from public.community_offers where community_id = p_community_id
    and access_type = 'paid' and status = 'published') then
    raise exception 'Paid Communities still need team approval'; end if;
  select coalesce(nullif(trim(display_name), ''), 'Community Host') into host_name
    from public.profiles where id = auth.uid();
  insert into public.community_pilot_publications(community_id, owner_id, application_id)
    values(p_community_id, auth.uid(), application.id) on conflict do nothing;
  update public.communities set status = 'published', updated_at = now()
    where id = p_community_id;
  update public.communities set
    tagline = left(application.community_name, 140),
    about_summary = left(application.purpose || ' A member-led space to meet, share ideas and stay connected.', 900),
    audience_summary = left(application.intended_members, 400),
    host_display_name = left(host_name, 100),
    host_intro = left(application.host_experience, 600),
    about_benefits = array['Share ideas and ask questions', 'Meet members with a shared purpose', 'Stay connected around Community events'],
    public_preview_enabled = application.admission_model <> 'invitation_only',
    public_preview_updated_by = auth.uid(), public_preview_updated_at = now()
    where id = p_community_id;
  insert into public.audit_events(actor_id, action, target_type, target_id)
    values(auth.uid(), 'community.pilot_opened_by_owner', 'community', p_community_id);
end;
$$;
revoke all on function public.open_my_pilot_community(uuid) from public, anon;
grant execute on function public.open_my_pilot_community(uuid) to authenticated;

create or replace function public.open_founding_pilot_community_after_creation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pilot_auto_draft and new.status = 'approved'
    and new.created_community_id is not null and auth.uid() = new.applicant_id
    and public.community_pilot_member_ready(auth.uid())
    and not exists (select 1 from public.community_pilot_publications
      where community_id = new.created_community_id) then
    perform public.open_my_pilot_community(new.created_community_id);
  end if;
  return new;
end;
$$;
revoke all on function public.open_founding_pilot_community_after_creation() from public, anon, authenticated;
create trigger open_founding_pilot_community_after_creation
after update of status, pilot_auto_draft on public.community_host_applications
for each row execute function public.open_founding_pilot_community_after_creation();

-- The joining-choice wrapper records open_join after the creation trigger.
create or replace function public.sync_pilot_community_join_choice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pilot_auto_draft and new.status = 'approved' and auth.uid() = new.applicant_id
    and exists (select 1 from public.community_pilot_publications where community_id = new.created_community_id) then
    update public.communities set join_policy = case new.admission_model
      when 'open_join' then 'open' when 'invitation_only' then 'invite_only' else 'approval' end
      where id = new.created_community_id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_pilot_community_join_choice() from public, anon, authenticated;
create trigger sync_pilot_community_join_choice
after update of admission_model, status on public.community_host_applications
for each row execute function public.sync_pilot_community_join_choice();

create or replace function public.can_self_publish_pilot_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.founding_pilot_member_ready(auth.uid())
    and public.get_pilot_free_event_setting() and public.can_host_event(p_event_id)
    and exists (select 1 from public.events event
      join public.member_event_proposals proposal on proposal.canonical_event_id = event.id
      where event.id = p_event_id and event.status = 'published'
        and event.starts_at > now() and event.audience = 'public'
        and proposal.proposed_by = auth.uid() and proposal.pilot_auto_draft
        and proposal.status = 'approved'
        and not exists (select 1 from public.ticket_types ticket
          where ticket.event_id = event.id and ticket.status = 'on_sale' and ticket.price_minor > 0));
$$;
revoke all on function public.can_self_publish_pilot_event(uuid) from public, anon;
grant execute on function public.can_self_publish_pilot_event(uuid) to authenticated;

create or replace function public.publish_my_pilot_event_updates(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare draft public.event_host_workspaces%rowtype; item jsonb; saved_session uuid; saved_speaker uuid;
begin
  perform 1 from public.events where id = p_event_id for update;
  if not public.can_self_publish_pilot_event(p_event_id) then
    raise exception 'Automatic event updates are paused or this event is not eligible'; end if;
  select * into draft from public.event_host_workspaces where event_id = p_event_id for update;
  if not found or draft.status <> 'draft' or char_length(draft.summary) < 40
    or char_length(draft.arrival_info) < 20 or jsonb_array_length(draft.programme) = 0 then
    raise exception 'Save an introduction, arrival details and at least one programme moment first'; end if;
  -- save_event_host_workspace validates programme times, keys and partner URLs.
  update public.event_host_workspaces set status = 'submitted', submitted_at = now()
    where event_id = p_event_id;
  update public.programme_sessions session set status = 'cancelled', updated_at = now()
    where session.event_id = p_event_id and session.host_workspace_key is not null
      and not exists (select 1 from jsonb_array_elements(draft.programme) entry
        where entry->>'key' = session.host_workspace_key::text);
  for item in select value from jsonb_array_elements(draft.programme) loop
    select id into saved_session from public.programme_sessions
      where event_id = p_event_id and host_workspace_key = (item->>'key')::uuid;
    if saved_session is null then
      insert into public.programme_sessions(event_id,title,description,starts_at,ends_at,room,status,host_workspace_key)
        values(p_event_id,item->>'title',item->>'description',(item->>'starts_at')::timestamptz,
          (item->>'ends_at')::timestamptz,item->>'room','published',(item->>'key')::uuid)
        returning id into saved_session;
    else
      update public.programme_sessions set title=item->>'title',description=item->>'description',
        starts_at=(item->>'starts_at')::timestamptz,ends_at=(item->>'ends_at')::timestamptz,
        room=item->>'room',status='published',updated_at=now() where id=saved_session;
    end if;
    delete from public.session_speakers where session_id=saved_session;
    if nullif(trim(item->>'speaker_name'),'') is not null then
      select id into saved_speaker from public.event_speakers
        where event_id=p_event_id and name=trim(item->>'speaker_name') limit 1;
      if saved_speaker is null then
        insert into public.event_speakers(event_id,name) values(p_event_id,trim(item->>'speaker_name'))
          returning id into saved_speaker;
      end if;
      insert into public.session_speakers(session_id,speaker_id) values(saved_session,saved_speaker);
    end if;
    saved_session := null; saved_speaker := null;
  end loop;
  update public.event_announcements set body=draft.arrival_info,status='published',published_at=now(),updated_at=now()
    where event_id=p_event_id and host_workspace_key='arrival';
  if not found then
    insert into public.event_announcements(event_id,title,body,status,published_at,created_by,host_workspace_key)
      values(p_event_id,'Before you arrive',draft.arrival_info,'published',now(),auth.uid(),'arrival');
  end if;
  update public.event_sponsors sponsor set is_published=false,updated_at=now()
    where sponsor.event_id=p_event_id and sponsor.host_workspace_key is not null;
  for item in select value from jsonb_array_elements(draft.partners) loop
    insert into public.event_sponsors(event_id,name,tier,website_url,logo_url,is_published,sort_order,host_workspace_key)
      values(p_event_id,trim(item->>'name'),nullif(item->>'tier',''),nullif(item->>'website_url',''),
        nullif(item->>'logo_url',''),true,0,(item->>'key')::uuid)
      on conflict(event_id,host_workspace_key) where host_workspace_key is not null
      do update set name=excluded.name,tier=excluded.tier,website_url=excluded.website_url,
        logo_url=excluded.logo_url,is_published=true,updated_at=now();
  end loop;
  update public.events set summary=draft.summary,updated_by=auth.uid(),updated_at=now() where id=p_event_id;
  update public.event_host_workspaces set status='approved',review_note=null,reviewed_at=now(),reviewed_by=auth.uid(),
    published_programme=programme,published_partners=partners,updated_at=now() where event_id=p_event_id;
  insert into public.audit_events(actor_id,action,target_type,target_id)
    values(auth.uid(),'event.pilot_updates_published_by_host','event',p_event_id);
end;
$$;
revoke all on function public.publish_my_pilot_event_updates(uuid) from public, anon;
grant execute on function public.publish_my_pilot_event_updates(uuid) to authenticated;

create or replace function public.publish_pilot_host_cover()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.can_self_publish_pilot_event(new.event_id) then
    new.published_storage_path := new.draft_storage_path;
    new.published_alt_text := new.draft_alt_text;
  end if;
  return new;
end;
$$;
revoke all on function public.publish_pilot_host_cover() from public, anon, authenticated;
create trigger publish_pilot_host_cover before insert or update of draft_storage_path,draft_alt_text
on public.event_host_covers for each row execute function public.publish_pilot_host_cover();

create or replace function public.publish_pilot_proposal_poster()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_id uuid;
begin
  if new.context_type = 'member_event_proposal' and new.owner_id = auth.uid() and new.status = 'submitted' then
    select canonical_event_id into event_id from public.member_event_proposals where id = new.context_id;
    if public.can_self_publish_pilot_event(event_id) then
      new.status := 'approved'; new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.publish_pilot_proposal_poster() from public, anon, authenticated;
create trigger publish_pilot_proposal_poster before insert on public.application_proposal_media
for each row execute function public.publish_pilot_proposal_poster();

notify pgrst, 'reload schema';
commit;
