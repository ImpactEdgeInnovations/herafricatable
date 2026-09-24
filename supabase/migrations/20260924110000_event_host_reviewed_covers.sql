begin;

-- A Host's new image stays private until the same Admin decision that
-- publishes the Host's words and programme. The previous approved image
-- remains visible while a replacement is being reviewed.
create table public.event_host_covers (
  event_id uuid primary key references public.event_host_workspaces(event_id) on delete cascade,
  draft_storage_path text not null,
  draft_alt_text text not null check (char_length(trim(draft_alt_text)) between 10 and 240),
  published_storage_path text,
  published_alt_text text,
  updated_at timestamptz not null default now(),
  constraint event_host_cover_published_pair check (
    (published_storage_path is null) = (published_alt_text is null)
  )
);
alter table public.event_host_covers enable row level security;
revoke all on public.event_host_covers from public, anon, authenticated;
grant select on public.event_host_covers to authenticated;

create policy "Hosts and Super Admins read event covers"
  on public.event_host_covers for select to authenticated
  using (
    public.can_host_event(event_id)
    or public.is_admin(array['super_admin']::public.app_role[])
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('event-host-covers', 'event-host-covers', false, 6291456,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict(id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_upload_event_host_cover(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select array_length(string_to_array(p_path, '/'), 1) = 3
    and split_part(p_path, '/', 2) = auth.uid()::text
    and split_part(p_path, '/', 3) ~* '^[0-9a-f-]+\.(jpg|png|webp)$'
    and public.can_host_event(
      case when split_part(p_path, '/', 1) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(p_path, '/', 1)::uuid else null end
    )
    and exists (
      select 1 from public.event_host_workspaces workspace
      where workspace.event_id::text = split_part(p_path, '/', 1)
        and workspace.status <> 'submitted'
    );
$$;
revoke all on function public.can_upload_event_host_cover(text) from public;
grant execute on function public.can_upload_event_host_cover(text) to authenticated;

create or replace function public.can_read_event_host_cover(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    split_part(p_path, '/', 2) = auth.uid()::text
    and public.can_host_event(
      case when split_part(p_path, '/', 1) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(p_path, '/', 1)::uuid else null end
    )
  ), false) or exists (
    select 1 from public.event_host_covers cover
    join public.events event on event.id = cover.event_id
    where p_path in (cover.draft_storage_path, cover.published_storage_path)
      and (
        public.can_host_event(cover.event_id)
        or public.is_admin(array['super_admin']::public.app_role[])
        or (p_path = cover.published_storage_path
            and event.status in ('published', 'completed'))
      )
  );
$$;
revoke all on function public.can_read_event_host_cover(text) from public;
grant execute on function public.can_read_event_host_cover(text) to anon, authenticated;

create policy "Event Hosts upload private covers"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-host-covers'
    and public.can_upload_event_host_cover(name));
create policy "Approved event covers and their reviewers can read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-host-covers'
    and public.can_read_event_host_cover(name));
create policy "Event Hosts remove unused draft covers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-host-covers'
    and split_part(name, '/', 2) = auth.uid()::text
    and public.can_host_event(
      case when split_part(name, '/', 1) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(name, '/', 1)::uuid else null end
    )
    and not exists (
      select 1 from public.event_host_covers cover
      where cover.published_storage_path = storage.objects.name
    ));

create or replace function public.save_event_host_cover(
  p_event_id uuid, p_storage_path text, p_alt_text text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old_draft text;
begin
  if not public.can_host_event(p_event_id) then
    raise exception 'Only the active Event Host can prepare this image';
  end if;
  if (select status from public.event_host_workspaces where event_id = p_event_id)
    = 'submitted' then
    raise exception 'This draft is with the event team for review';
  end if;
  if p_storage_path not like p_event_id::text || '/' || auth.uid()::text || '/%'
    or not public.can_upload_event_host_cover(p_storage_path) then
    raise exception 'This image does not belong to your event';
  end if;
  if char_length(trim(coalesce(p_alt_text, ''))) not between 10 and 240 then
    raise exception 'Describe the image in 10 to 240 characters';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'event-host-covers'
      and object.name = p_storage_path
      and object.owner_id = auth.uid()::text
      and object.metadata->>'mimetype' in ('image/jpeg', 'image/png', 'image/webp')
      and (object.metadata->>'size')::bigint <= 6291456
  ) then
    raise exception 'Choose a JPG, PNG or WebP image smaller than 6 MB';
  end if;
  select draft_storage_path into old_draft
  from public.event_host_covers where event_id = p_event_id for update;
  insert into public.event_host_covers(event_id, draft_storage_path, draft_alt_text)
  values (p_event_id, p_storage_path, trim(p_alt_text))
  on conflict(event_id) do update set
    draft_storage_path = excluded.draft_storage_path,
    draft_alt_text = excluded.draft_alt_text, updated_at = now();
  update public.event_host_workspaces
  set status = 'draft', updated_at = now()
  where event_id = p_event_id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.host_cover_saved', 'event', p_event_id,
          jsonb_build_object('replaced_draft', old_draft is not null));
end;
$$;
revoke all on function public.save_event_host_cover(uuid, text, text) from public;
grant execute on function public.save_event_host_cover(uuid, text, text) to authenticated;

create or replace function public.list_public_event_host_covers(p_event_ids uuid[])
returns table(event_id uuid, storage_path text, alt_text text)
language sql stable security definer set search_path = '' as $$
  select cover.event_id, cover.published_storage_path, cover.published_alt_text
  from public.event_host_covers cover
  join public.events event on event.id = cover.event_id
  where cover.event_id = any(p_event_ids)
    and event.status in ('published', 'completed')
    and cover.published_storage_path is not null;
$$;
revoke all on function public.list_public_event_host_covers(uuid[]) from public;
grant execute on function public.list_public_event_host_covers(uuid[]) to anon, authenticated;

create or replace function public.publish_event_host_cover()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and old.status = 'submitted' then
    update public.event_host_covers
    set published_storage_path = draft_storage_path,
        published_alt_text = draft_alt_text, updated_at = now()
    where event_id = new.event_id;
  end if;
  return new;
end;
$$;
create trigger publish_event_host_cover_after_review
  after update of status on public.event_host_workspaces
  for each row execute function public.publish_event_host_cover();

-- A joining link belongs only in event_private_details. Reject public-facing
-- URLs from Host arrival copy even if a client bypasses the visible warning.
create or replace function public.guard_event_host_arrival_links()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'approved'
    and new.arrival_info ~* '(https?://|www\.|meet\.google\.|zoom\.us|teams\.microsoft\.)' then
    raise exception 'Remove links from public arrival notes; put private joining links in event details';
  end if;
  return new;
end;
$$;
create trigger guard_event_host_arrival_links_before_review
  before update of status on public.event_host_workspaces
  for each row execute function public.guard_event_host_arrival_links();

commit;
