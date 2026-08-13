begin;

create table if not exists public.application_proposal_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  context_type text not null check (
    context_type in ('community_application', 'member_event_proposal')
  ),
  context_id uuid not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  width integer not null check (width between 400 and 6000),
  height integer not null check (height between 240 and 6000),
  alt_text text not null check (char_length(trim(alt_text)) between 10 and 240),
  status text not null default 'submitted' check (
    status in ('submitted', 'approved', 'changes_requested', 'rejected', 'removed')
  ),
  is_current boolean not null default true,
  review_note text check (
    review_note is null or char_length(trim(review_note)) between 10 and 1000
  ),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists application_proposal_media_current_idx
  on public.application_proposal_media(context_type, context_id)
  where is_current;
create index if not exists application_proposal_media_review_idx
  on public.application_proposal_media(status, created_at)
  where is_current;
create index if not exists application_proposal_media_owner_idx
  on public.application_proposal_media(owner_id, updated_at desc);

alter table public.application_proposal_media enable row level security;

drop policy if exists "Applicants read their proposal images"
  on public.application_proposal_media;
create policy "Applicants read their proposal images"
  on public.application_proposal_media for select to authenticated
  using (
    owner_id = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'proposal-media',
  'proposal-media',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_upload_application_proposal_media(
  p_storage_path text,
  p_actor uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[] := string_to_array(coalesce(p_storage_path, ''), '/');
begin
  if p_actor is null or array_length(parts, 1) <> 4 or parts[3] <> p_actor::text then
    return false;
  end if;
  if parts[1] = 'community_application' then
    return exists (
      select 1 from public.community_host_applications application
      where application.id::text = parts[2]
        and application.applicant_id = p_actor
        and application.status not in ('declined', 'withdrawn')
    );
  end if;
  if parts[1] = 'member_event_proposal' then
    return exists (
      select 1 from public.member_event_proposals proposal
      where proposal.id::text = parts[2]
        and proposal.proposed_by = p_actor
        and proposal.status not in ('declined', 'cancelled')
    );
  end if;
  return false;
end;
$$;

drop policy if exists "Applicants upload proposal images" on storage.objects;
create policy "Applicants upload proposal images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proposal-media'
    and public.can_upload_application_proposal_media(name, auth.uid())
  );

drop policy if exists "Authorised people read proposal images" on storage.objects;
create policy "Authorised people read proposal images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'proposal-media'
    and exists (
      select 1 from public.application_proposal_media media
      where media.storage_path = storage.objects.name
        and (
          media.owner_id = auth.uid()
          or public.is_admin(array['super_admin']::public.app_role[])
          or (
            media.context_type = 'member_event_proposal'
            and media.status = 'approved'
            and media.is_current
            and exists (
              select 1
              from public.member_event_proposals proposal
              join public.events event on event.id = proposal.canonical_event_id
              where proposal.id = media.context_id
                and proposal.status = 'approved'
                and event.status = 'published'
            )
          )
        )
    )
  );

drop policy if exists "Visitors read approved public event posters" on storage.objects;
create policy "Visitors read approved public event posters"
  on storage.objects for select to anon
  using (
    bucket_id = 'proposal-media'
    and exists (
      select 1
      from public.application_proposal_media media
      join public.member_event_proposals proposal
        on proposal.id = media.context_id
       and media.context_type = 'member_event_proposal'
      join public.events event on event.id = proposal.canonical_event_id
      where media.storage_path = storage.objects.name
        and media.status = 'approved'
        and media.is_current
        and proposal.status = 'approved'
        and event.status = 'published'
    )
  );

drop policy if exists "Applicants remove proposal images" on storage.objects;
create policy "Applicants remove proposal images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'proposal-media'
    and exists (
      select 1 from public.application_proposal_media media
      where media.storage_path = storage.objects.name
        and media.owner_id = auth.uid()
        and media.is_current
        and media.status <> 'approved'
    )
  );

create or replace function public.save_application_proposal_media(
  p_context_type text,
  p_context_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_width integer,
  p_height integer,
  p_alt_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved uuid;
begin
  if actor is null or not public.is_active_member(actor) then
    raise exception 'Active membership required';
  end if;
  if p_context_type not in ('community_application', 'member_event_proposal') then
    raise exception 'Unsupported application image';
  end if;
  if not public.can_upload_application_proposal_media(p_storage_path, actor)
    or split_part(p_storage_path, '/', 1) <> p_context_type
    or split_part(p_storage_path, '/', 2) <> p_context_id::text then
    raise exception 'This image does not belong to this application';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Use a JPG, PNG or WebP image';
  end if;
  if p_width not between 400 and 6000 or p_height not between 240 and 6000 then
    raise exception 'Choose an image between 400 and 6000 pixels wide and 240 and 6000 pixels high';
  end if;
  if char_length(trim(coalesce(p_alt_text, ''))) not between 10 and 240 then
    raise exception 'Describe the image in 10 to 240 characters';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'proposal-media' and object.name = p_storage_path
  ) then
    raise exception 'The uploaded image could not be found';
  end if;

  update public.application_proposal_media
  set is_current = false, updated_at = now()
  where context_type = p_context_type and context_id = p_context_id and is_current;

  insert into public.application_proposal_media(
    owner_id, context_type, context_id, storage_path, mime_type,
    width, height, alt_text
  ) values (
    actor, p_context_type, p_context_id, p_storage_path, p_mime_type,
    p_width, p_height, trim(p_alt_text)
  ) returning id into saved;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'application.media_submitted', p_context_type, p_context_id,
    jsonb_build_object('media_id', saved, 'mime_type', p_mime_type, 'width', p_width, 'height', p_height)
  );
  return saved;
end;
$$;

create or replace function public.remove_application_proposal_media(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.application_proposal_media%rowtype;
begin
  select * into target from public.application_proposal_media
  where id = p_media_id for update;
  if not found or target.owner_id <> auth.uid() or not target.is_current then
    raise exception 'Application image not found';
  end if;
  if target.status = 'approved' then
    raise exception 'Ask the review team before removing an approved image';
  end if;
  update public.application_proposal_media
  set status = 'removed', is_current = false, updated_at = now()
  where id = target.id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'application.media_removed', target.context_type, target.context_id,
    jsonb_build_object('media_id', target.id)
  );
end;
$$;

create or replace function public.review_application_proposal_media(
  p_media_id uuid,
  p_action text,
  p_review_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.application_proposal_media%rowtype;
  next_status text;
  href text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin access required';
  end if;
  if p_action not in ('approve', 'request_changes', 'reject') then
    raise exception 'Unsupported image decision';
  end if;
  if p_action in ('request_changes', 'reject')
    and char_length(trim(coalesce(p_review_note, ''))) < 10 then
    raise exception 'Add a clear note for the member';
  end if;
  select * into target from public.application_proposal_media
  where id = p_media_id and is_current for update;
  if not found then raise exception 'Application image not found'; end if;
  next_status := case p_action
    when 'approve' then 'approved'
    when 'request_changes' then 'changes_requested'
    else 'rejected'
  end;
  update public.application_proposal_media
  set status = next_status,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_by = actor,
      reviewed_at = now(),
      updated_at = now()
  where id = target.id;

  href := case target.context_type
    when 'community_application' then '/communities#create-community'
    else '/events#propose-event'
  end;
  perform public.enqueue_notification(
    target.owner_id,
    case target.context_type when 'community_application' then 'community' else 'event' end,
    case p_action
      when 'approve' then 'Your application image is approved'
      when 'request_changes' then 'Please replace your application image'
      else 'Your application image will not be used'
    end,
    case p_action
      when 'approve' then 'The image passed review. The application itself follows its separate review decision.'
      when 'request_changes' then 'The review team left guidance. Open your application to replace the image.'
      else 'The image was not approved. This does not automatically decline your application.'
    end,
    href,
    'application-media:' || target.id || ':' || next_status
  );
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'application.media_' || p_action, target.context_type, target.context_id,
    jsonb_build_object('media_id', target.id, 'status', next_status)
  );
end;
$$;

create or replace function public.list_my_application_proposal_media()
returns table(
  media_id uuid, context_type text, context_id uuid, owner_id uuid,
  storage_path text, mime_type text, width integer, height integer,
  alt_text text, status text, review_note text,
  created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select media.id, media.context_type, media.context_id, media.owner_id,
    media.storage_path, media.mime_type, media.width, media.height,
    media.alt_text, media.status, media.review_note,
    media.created_at, media.updated_at
  from public.application_proposal_media media
  where media.owner_id = auth.uid() and media.is_current
  order by media.updated_at desc;
$$;

create or replace function public.list_admin_application_proposal_media()
returns table(
  media_id uuid, context_type text, context_id uuid, owner_id uuid,
  storage_path text, mime_type text, width integer, height integer,
  alt_text text, status text, review_note text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin access required';
  end if;
  return query
  select media.id, media.context_type, media.context_id, media.owner_id,
    media.storage_path, media.mime_type, media.width, media.height,
    media.alt_text, media.status, media.review_note,
    media.created_at, media.updated_at
  from public.application_proposal_media media
  where media.is_current
  order by
    case media.status when 'submitted' then 0 when 'changes_requested' then 1 else 2 end,
    media.updated_at desc;
end;
$$;

create or replace function public.list_public_event_proposal_posters(p_event_ids uuid[])
returns table(event_id uuid, storage_path text, alt_text text)
language sql
stable
security definer
set search_path = ''
as $$
  select event.id, media.storage_path, media.alt_text
  from public.application_proposal_media media
  join public.member_event_proposals proposal
    on proposal.id = media.context_id
   and media.context_type = 'member_event_proposal'
  join public.events event on event.id = proposal.canonical_event_id
  where event.id = any(coalesce(p_event_ids, array[]::uuid[]))
    and media.status = 'approved'
    and media.is_current
    and proposal.status = 'approved'
    and event.status = 'published';
$$;

revoke all on function public.can_upload_application_proposal_media(text,uuid) from public;
grant execute on function public.can_upload_application_proposal_media(text,uuid) to authenticated;
revoke all on function public.save_application_proposal_media(text,uuid,text,text,integer,integer,text) from public;
grant execute on function public.save_application_proposal_media(text,uuid,text,text,integer,integer,text) to authenticated;
revoke all on function public.remove_application_proposal_media(uuid) from public;
grant execute on function public.remove_application_proposal_media(uuid) to authenticated;
revoke all on function public.review_application_proposal_media(uuid,text,text) from public;
grant execute on function public.review_application_proposal_media(uuid,text,text) to authenticated;
revoke all on function public.list_my_application_proposal_media() from public;
grant execute on function public.list_my_application_proposal_media() to authenticated;
revoke all on function public.list_admin_application_proposal_media() from public;
grant execute on function public.list_admin_application_proposal_media() to authenticated;
revoke all on function public.list_public_event_proposal_posters(uuid[]) from public;
grant execute on function public.list_public_event_proposal_posters(uuid[]) to anon, authenticated;

comment on table public.application_proposal_media is
  'Private optional images supplied with Community and member Event applications. Media review is independent from the application decision; only approved public Event posters may be shown publicly.';

commit;
