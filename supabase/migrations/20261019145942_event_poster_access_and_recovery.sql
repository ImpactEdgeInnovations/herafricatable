begin;

-- Published posters inherit event visibility. Keep both mixed-use buckets private.
-- Internal boolean lookup avoids applicant-table RLS hiding an approved poster
-- from non-owners; it never grants access to draft/private proposal records.
create schema if not exists event_media_private;
revoke all on schema event_media_private from public;
grant usage on schema event_media_private to anon, authenticated;

create or replace function event_media_private.can_read_published_proposal_poster(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.application_proposal_media media
    join public.member_event_proposals proposal on proposal.id = media.context_id
      and media.context_type = 'member_event_proposal'
    join public.events event on event.id = proposal.canonical_event_id
    where media.storage_path = p_path and media.status = 'approved' and media.is_current
      and proposal.status = 'approved' and event.status in ('published', 'completed')
      -- can_view_event checks public audience OR this caller's active Community
      -- membership / authorised event-management scope, using auth.uid().
      and public.can_view_event(event.id, auth.uid())
  );
$$;
revoke all on function event_media_private.can_read_published_proposal_poster(text) from public;
grant execute on function event_media_private.can_read_published_proposal_poster(text) to anon, authenticated;

drop policy if exists "Visitors read approved public event posters" on storage.objects;
drop policy if exists "Visitors read visible published event posters" on storage.objects;
create policy "Visitors read visible published event posters" on storage.objects
for select to anon, authenticated using (
  bucket_id = 'proposal-media'
  and event_media_private.can_read_published_proposal_poster(name)
);

-- Preserve applicant/Admin draft access separately from audience access.
alter policy "Authorised people read proposal images" on storage.objects
to authenticated using (
  bucket_id = 'proposal-media' and exists (
    select 1 from public.application_proposal_media media
    where media.storage_path = objects.name
      and (media.owner_id = auth.uid() or public.is_admin(array['super_admin']::public.app_role[]))
  )
);

create or replace function public.list_public_event_proposal_posters(p_event_ids uuid[])
returns table(event_id uuid, storage_path text, alt_text text)
language sql stable security definer set search_path = '' as $$
  select event.id, media.storage_path, media.alt_text
  from public.application_proposal_media media
  join public.member_event_proposals proposal on proposal.id = media.context_id
    and media.context_type = 'member_event_proposal'
  join public.events event on event.id = proposal.canonical_event_id
  where event.id = any(coalesce(p_event_ids, array[]::uuid[]))
    and media.status = 'approved' and media.is_current and proposal.status = 'approved'
    and event.status in ('published', 'completed') and public.can_view_event(event.id, auth.uid());
$$;
revoke all on function public.list_public_event_proposal_posters(uuid[]) from public;
grant execute on function public.list_public_event_proposal_posters(uuid[]) to anon, authenticated;

create or replace function public.list_public_event_host_covers(p_event_ids uuid[])
returns table(event_id uuid, storage_path text, alt_text text)
language sql stable security definer set search_path = '' as $$
  select cover.event_id, cover.published_storage_path, cover.published_alt_text
  from public.event_host_covers cover join public.events event on event.id = cover.event_id
  where cover.event_id = any(coalesce(p_event_ids, array[]::uuid[]))
    and event.status in ('published', 'completed') and cover.published_storage_path is not null
    and public.can_view_event(event.id, auth.uid());
$$;
revoke all on function public.list_public_event_host_covers(uuid[]) from public;
grant execute on function public.list_public_event_host_covers(uuid[]) to anon, authenticated;

-- Keep existing Host/reviewer draft rights; published covers now honour audience.
create or replace function public.can_read_event_host_cover(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((split_part(p_path, '/', 2) = auth.uid()::text
    and public.can_host_event(case when split_part(p_path, '/', 1) ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(p_path, '/', 1)::uuid else null end)), false)
    or exists (select 1 from public.event_host_covers cover
      join public.events event on event.id = cover.event_id
      where p_path in (cover.draft_storage_path, cover.published_storage_path)
        and (public.can_host_event(cover.event_id)
          or public.is_admin(array['super_admin']::public.app_role[])
          or (p_path = cover.published_storage_path and event.status in ('published', 'completed')
            and public.can_view_event(event.id, auth.uid()))));
$$;
revoke all on function public.can_read_event_host_cover(text) from public;
grant execute on function public.can_read_event_host_cover(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
