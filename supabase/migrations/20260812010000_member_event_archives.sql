begin;

create table if not exists public.member_event_archive_submissions (
  event_id uuid primary key references public.events(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 4 and 140),
  summary text not null check (char_length(trim(summary)) between 40 and 4000),
  highlights text[] not null default array[]::text[],
  community_id uuid references public.communities(id) on delete set null,
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'declined')
  ),
  review_note text check (review_note is null or char_length(review_note) <= 1200),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_event_media_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  alt_text text not null check (char_length(trim(alt_text)) between 5 and 300),
  caption text check (caption is null or char_length(caption) <= 600),
  credit text check (credit is null or char_length(credit) <= 160),
  captured_at timestamptz,
  consent_confirmed_at timestamptz not null,
  status text not null default 'submitted' check (
    status in ('submitted', 'approved', 'rejected', 'withdrawn')
  ),
  review_note text check (review_note is null or char_length(review_note) <= 1200),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  media_asset_id uuid unique references public.media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_community_continuations (
  event_id uuid primary key references public.events(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  linked_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists member_event_archive_review_idx
  on public.member_event_archive_submissions(status, submitted_at, updated_at desc);
create index if not exists member_event_media_review_idx
  on public.member_event_media_submissions(status, created_at);
create index if not exists member_event_media_member_idx
  on public.member_event_media_submissions(submitted_by, event_id, created_at desc);
create index if not exists event_community_continuations_community_idx
  on public.event_community_continuations(community_id, published_at desc);

alter table public.member_event_archive_submissions enable row level security;
alter table public.member_event_media_submissions enable row level security;
alter table public.event_community_continuations enable row level security;

create or replace function public.can_view_event(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events event
    where event.id = p_event_id
      and event.status in ('published', 'completed')
      and (
        event.audience = 'public'
        or public.can_manage_event(event.id)
        or (
          event.audience = 'community'
          and p_user_id is not null
          and p_user_id = auth.uid()
          and public.is_active_member(p_user_id)
          and exists (
            select 1
            from public.community_event_links event_link
            join public.community_memberships membership
              on membership.community_id = event_link.community_id
             and membership.user_id = p_user_id
             and membership.status = 'active'
            where event_link.event_id = event.id
          )
        )
      )
  );
$$;

drop policy if exists "Event Hosts read own archive submissions"
  on public.member_event_archive_submissions;
create policy "Event Hosts read own archive submissions"
  on public.member_event_archive_submissions for select to authenticated
  using (
    proposed_by = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  );

drop policy if exists "Members read own event media submissions"
  on public.member_event_media_submissions;
create policy "Members read own event media submissions"
  on public.member_event_media_submissions for select to authenticated
  using (
    submitted_by = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  );

drop policy if exists "Anyone reads published event Community continuation"
  on public.event_community_continuations;
create policy "Anyone reads published event Community continuation"
  on public.event_community_continuations for select to anon, authenticated
  using (
    public.can_view_event(event_id)
    and exists (
      select 1 from public.communities community
      where community.id = community_id and community.status = 'published'
    )
  );

create or replace function public.can_submit_member_event_archive(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and p_user_id = auth.uid() and exists (
    select 1
    from public.member_event_proposals proposal
    join public.events event on event.id = proposal.canonical_event_id
    where event.id = p_event_id
      and proposal.proposed_by = p_user_id
      and proposal.status = 'approved'
      and event.ends_at < now()
      and public.is_active_member(p_user_id)
  );
$$;

create or replace function public.can_submit_event_media(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and p_user_id = auth.uid()
    and public.is_active_member(p_user_id)
    and exists (
      select 1 from public.events event
      where event.id = p_event_id and event.ends_at < now()
        and (
          exists (
            select 1 from public.member_event_proposals proposal
            where proposal.canonical_event_id = event.id
              and proposal.proposed_by = p_user_id
              and proposal.status = 'approved'
          )
          or exists (
            select 1 from public.event_memberships membership
            where membership.event_id = event.id
              and membership.user_id = p_user_id
              and membership.status in ('confirmed', 'attended')
          )
        )
    );
$$;

create or replace function public.event_media_submission_path_allowed(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.event_media_event_id(object_name) is not null
    and split_part(object_name, '/', 2) = auth.uid()::text
    and split_part(object_name, '/', 3) = 'member-submissions'
    and public.can_submit_event_media(public.event_media_event_id(object_name));
$$;

create or replace function public.can_read_event_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_event(public.event_media_event_id(object_name))
    or exists (
      select 1
      from public.member_event_media_submissions submission
      where submission.storage_path = object_name
        and submission.submitted_by = auth.uid()
    )
    or exists (
      select 1
      from public.media_assets asset
      join public.gallery_albums album on album.id = asset.album_id
      where asset.storage_path = object_name
        and asset.status = 'published'
        and album.status = 'published'
        and public.can_view_event(album.event_id)
    );
$$;

drop policy if exists "Members submit event archive media" on storage.objects;
create policy "Members submit event archive media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-media'
    and public.event_media_submission_path_allowed(name)
  );

drop policy if exists "Members remove unapproved event archive media" on storage.objects;
create policy "Members remove unapproved event archive media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-media'
    and exists (
      select 1 from public.member_event_media_submissions submission
      where submission.storage_path = storage.objects.name
        and submission.submitted_by = auth.uid()
        and submission.status in ('submitted', 'rejected', 'withdrawn')
    )
  );

create or replace function public.get_my_member_event_archive(p_event_id uuid)
returns table(
  available boolean,
  is_event_host boolean,
  archive_title text,
  archive_summary text,
  archive_highlights text[],
  community_id uuid,
  status text,
  review_note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.can_submit_event_media(p_event_id),
    public.can_submit_member_event_archive(p_event_id),
    archive.title,
    archive.summary,
    archive.highlights,
    archive.community_id,
    archive.status,
    archive.review_note
  from (select 1) seed
  left join public.member_event_archive_submissions archive
    on archive.event_id = p_event_id and archive.proposed_by = auth.uid()
  where public.can_submit_event_media(p_event_id);
$$;

create or replace function public.list_my_event_media_submissions(p_event_id uuid)
returns table(
  submission_id uuid,
  storage_path text,
  alt_text text,
  caption text,
  credit text,
  captured_at timestamptz,
  status text,
  review_note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select submission.id, submission.storage_path, submission.alt_text,
    submission.caption, submission.credit, submission.captured_at,
    submission.status, submission.review_note, submission.created_at
  from public.member_event_media_submissions submission
  where submission.event_id = p_event_id and submission.submitted_by = auth.uid()
  order by submission.created_at desc;
$$;

create or replace function public.save_member_event_archive(
  p_event_id uuid,
  p_title text,
  p_summary text,
  p_highlights text[],
  p_community_id uuid,
  p_submit boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_highlights text[];
  current_status text;
begin
  if not public.can_submit_member_event_archive(p_event_id, actor) then
    raise exception 'Only the approved event Host can prepare this archive';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 4 and 140
    or char_length(trim(coalesce(p_summary, ''))) not between 40 and 4000 then
    raise exception 'Add a clear title and event story';
  end if;
  select coalesce(array_agg(value order by ord), array[]::text[])
  into clean_highlights
  from (
    select trim(item) value, ord
    from unnest(coalesce(p_highlights, array[]::text[])) with ordinality as h(item, ord)
    where char_length(trim(item)) between 2 and 240
    limit 12
  ) cleaned;
  if p_community_id is not null and not public.can_manage_community(p_community_id, actor) then
    raise exception 'Choose a Community that you lead';
  end if;
  select archive.status into current_status
  from public.member_event_archive_submissions archive
  where archive.event_id = p_event_id and archive.proposed_by = actor
  for update;
  if current_status is not null and current_status not in ('draft', 'changes_requested') then
    raise exception 'This archive is already with the review team';
  end if;
  insert into public.member_event_archive_submissions(
    event_id, proposed_by, title, summary, highlights, community_id,
    status, submitted_at
  ) values (
    p_event_id, actor, trim(p_title), trim(p_summary), clean_highlights,
    p_community_id, case when p_submit then 'submitted' else 'draft' end,
    case when p_submit then now() else null end
  )
  on conflict(event_id) do update
  set title = excluded.title, summary = excluded.summary,
      highlights = excluded.highlights, community_id = excluded.community_id,
      status = excluded.status,
      submitted_at = case when p_submit then now() else member_event_archive_submissions.submitted_at end,
      review_note = case when p_submit then null else member_event_archive_submissions.review_note end,
      reviewed_by = case when p_submit then null else member_event_archive_submissions.reviewed_by end,
      reviewed_at = case when p_submit then null else member_event_archive_submissions.reviewed_at end,
      updated_at = now();
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor,
    case when p_submit then 'event.archive_submitted' else 'event.archive_saved' end,
    'event', p_event_id,
    jsonb_build_object('community_id', p_community_id, 'highlight_count', cardinality(clean_highlights))
  );
end;
$$;

create or replace function public.submit_event_media(
  p_event_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_alt_text text,
  p_caption text,
  p_credit text,
  p_captured_at timestamptz,
  p_confirm_consent boolean
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
  if not public.can_submit_event_media(p_event_id, actor) then
    raise exception 'Confirmed attendance at a completed event is required';
  end if;
  if not coalesce(p_confirm_consent, false) then
    raise exception 'Confirm that you may share this image';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Choose a JPEG, PNG or WebP image';
  end if;
  if public.event_media_event_id(p_storage_path) is distinct from p_event_id
    or split_part(p_storage_path, '/', 2) <> actor::text
    or split_part(p_storage_path, '/', 3) <> 'member-submissions' then
    raise exception 'Media path is outside your event submission folder';
  end if;
  if char_length(trim(coalesce(p_alt_text, ''))) not between 5 and 300 then
    raise exception 'Describe what is visible in the image';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'event-media' and object.name = p_storage_path
  ) then
    raise exception 'Uploaded image was not found';
  end if;
  if (
    select count(*) from public.member_event_media_submissions submission
    where submission.event_id = p_event_id and submission.submitted_by = actor
      and submission.status <> 'withdrawn'
  ) >= 6 then
    raise exception 'You may submit up to six images for this event';
  end if;
  insert into public.member_event_media_submissions(
    event_id, submitted_by, storage_path, mime_type, alt_text, caption,
    credit, captured_at, consent_confirmed_at
  ) values (
    p_event_id, actor, p_storage_path, p_mime_type, trim(p_alt_text),
    nullif(trim(coalesce(p_caption, '')), ''),
    nullif(trim(coalesce(p_credit, '')), ''), p_captured_at, now()
  ) returning id into saved;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'event.media_submitted', 'member_event_media_submission', saved,
    jsonb_build_object('event_id', p_event_id, 'mime_type', p_mime_type)
  );
  return saved;
end;
$$;

create or replace function public.withdraw_event_media_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.member_event_media_submissions
  set status = 'withdrawn', updated_at = now()
  where id = p_submission_id and submitted_by = auth.uid()
    and status in ('submitted', 'rejected');
  if not found then raise exception 'This image can no longer be withdrawn here'; end if;
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), 'event.media_withdrawn', 'member_event_media_submission', p_submission_id);
end;
$$;

create or replace function public.list_admin_member_event_archives()
returns table(
  event_id uuid,
  event_slug text,
  event_title text,
  proposed_by uuid,
  proposer_name text,
  proposer_email text,
  archive_title text,
  archive_summary text,
  archive_highlights text[],
  community_id uuid,
  community_name text,
  community_slug text,
  status text,
  review_note text,
  submitted_at timestamptz,
  updated_at timestamptz
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
  select archive.event_id, event.slug, event.title, archive.proposed_by,
    profile.display_name, account.email::text, archive.title, archive.summary,
    archive.highlights, archive.community_id, community.name, community.slug,
    archive.status, archive.review_note, archive.submitted_at, archive.updated_at
  from public.member_event_archive_submissions archive
  join public.events event on event.id = archive.event_id
  join auth.users account on account.id = archive.proposed_by
  left join public.profiles profile on profile.id = archive.proposed_by
  left join public.communities community on community.id = archive.community_id
  order by case archive.status when 'submitted' then 0 when 'under_review' then 1 else 2 end,
    archive.submitted_at nulls last, archive.updated_at desc;
end;
$$;

create or replace function public.list_admin_event_media_submissions()
returns table(
  submission_id uuid,
  event_id uuid,
  event_slug text,
  event_title text,
  submitted_by uuid,
  submitter_name text,
  submitter_email text,
  is_event_host boolean,
  storage_path text,
  alt_text text,
  caption text,
  credit text,
  captured_at timestamptz,
  status text,
  review_note text,
  created_at timestamptz
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
  select submission.id, submission.event_id, event.slug, event.title,
    submission.submitted_by, profile.display_name, account.email::text,
    exists (
      select 1 from public.member_event_proposals proposal
      where proposal.canonical_event_id = submission.event_id
        and proposal.proposed_by = submission.submitted_by
    ),
    submission.storage_path, submission.alt_text, submission.caption,
    submission.credit, submission.captured_at, submission.status,
    submission.review_note, submission.created_at
  from public.member_event_media_submissions submission
  join public.events event on event.id = submission.event_id
  join auth.users account on account.id = submission.submitted_by
  left join public.profiles profile on profile.id = submission.submitted_by
  order by case submission.status when 'submitted' then 0 else 1 end,
    submission.created_at;
end;
$$;

create or replace function public.review_member_event_archive(
  p_event_id uuid,
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
  target public.member_event_archive_submissions%rowtype;
  next_status text;
  event_slug text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin access required';
  end if;
  if p_action not in ('start_review', 'request_changes', 'approve', 'decline') then
    raise exception 'Unsupported review action';
  end if;
  if p_action in ('request_changes', 'decline')
    and char_length(trim(coalesce(p_review_note, ''))) < 10 then
    raise exception 'Add a clear review note';
  end if;
  select * into target from public.member_event_archive_submissions
  where event_id = p_event_id for update;
  if not found or target.status not in ('submitted', 'under_review') then
    raise exception 'A submitted event archive is required';
  end if;

  if p_action = 'approve' then
    insert into public.event_recaps(
      event_id, title, summary, highlights, status, published_at, updated_by
    ) values (
      target.event_id, target.title, target.summary, target.highlights,
      'published', now(), actor
    )
    on conflict(event_id) do update
    set title = excluded.title, summary = excluded.summary,
        highlights = excluded.highlights, status = 'published',
        published_at = coalesce(event_recaps.published_at, now()),
        updated_by = actor, updated_at = now();
    if target.community_id is not null then
      if not exists (
        select 1 from public.communities community
        where community.id = target.community_id and community.status = 'published'
      ) then raise exception 'The linked Community must be published first'; end if;
      insert into public.event_community_continuations(event_id, community_id, linked_by)
      values (target.event_id, target.community_id, actor)
      on conflict(event_id) do update
      set community_id = excluded.community_id, linked_by = actor, published_at = now();
    else
      delete from public.event_community_continuations where event_id = target.event_id;
    end if;
    next_status := 'approved';
  else
    next_status := case p_action
      when 'start_review' then 'under_review'
      when 'request_changes' then 'changes_requested'
      else 'declined'
    end;
  end if;

  update public.member_event_archive_submissions
  set status = next_status,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_by = actor, reviewed_at = now(), updated_at = now()
  where event_id = p_event_id;
  select slug into event_slug from public.events where id = p_event_id;
  perform public.enqueue_notification(
    target.proposed_by, 'event',
    case when next_status = 'approved' then 'Your event story is published'
      when next_status = 'changes_requested' then 'Your event story needs an update'
      else 'An update on your event story' end,
    case when next_status = 'approved' then 'Your approved recap is now part of the public event archive.'
      when next_status = 'changes_requested' then 'The review team left guidance on your event story.'
      else 'The review team could not publish this event story in its current form.' end,
    '/events/' || event_slug,
    'member-event-archive:' || p_event_id || ':' || next_status
  );
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'event.archive_' || p_action, 'event', p_event_id,
    jsonb_build_object('status', next_status, 'community_id', target.community_id)
  );
end;
$$;

create or replace function public.review_event_media_submission(
  p_submission_id uuid,
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
  target public.member_event_media_submissions%rowtype;
  saved_album_id uuid;
  asset_id uuid;
  event_slug text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin access required';
  end if;
  if p_action not in ('approve', 'reject') then raise exception 'Unsupported review action'; end if;
  if p_action = 'reject' and char_length(trim(coalesce(p_review_note, ''))) < 10 then
    raise exception 'Add a clear review note';
  end if;
  select * into target from public.member_event_media_submissions
  where id = p_submission_id for update;
  if not found or target.status <> 'submitted' then
    raise exception 'A submitted image is required';
  end if;
  if p_action = 'approve' then
    insert into public.gallery_albums(event_id, title, introduction, status, sort_order, published_at)
    values (
      target.event_id, 'Moments from the gathering',
      'Images shared with permission by the Host and confirmed attendees.',
      'published', 90, now()
    )
    on conflict(event_id, title) do update
    set status = 'published', published_at = coalesce(gallery_albums.published_at, now()),
        updated_at = now()
    returning id into saved_album_id;
    insert into public.media_assets(
      album_id, storage_path, mime_type, alt_text, caption, credit,
      captured_at, status, is_featured, sort_order, uploaded_by
    ) values (
      saved_album_id, target.storage_path, target.mime_type, target.alt_text,
      target.caption, target.credit, target.captured_at, 'published', false,
      (select count(*)::integer from public.media_assets asset where asset.album_id = saved_album_id),
      target.submitted_by
    ) returning id into asset_id;
    update public.member_event_media_submissions
    set status = 'approved', media_asset_id = asset_id,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_by = actor, reviewed_at = now(), updated_at = now()
    where id = target.id;
  else
    update public.member_event_media_submissions
    set status = 'rejected', review_note = trim(p_review_note),
        reviewed_by = actor, reviewed_at = now(), updated_at = now()
    where id = target.id;
  end if;
  select slug into event_slug from public.events where id = target.event_id;
  perform public.enqueue_notification(
    target.submitted_by, 'event',
    case when p_action = 'approve' then 'Your event image is now published'
      else 'An update on your event image' end,
    case when p_action = 'approve' then 'The image you shared is now part of the approved event gallery.'
      else 'The review team could not publish this image. Open the event archive for guidance.' end,
    '/events/' || event_slug,
    'member-event-media:' || target.id || ':' || p_action
  );
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'event.media_' || p_action, 'member_event_media_submission', target.id,
    jsonb_build_object('event_id', target.event_id, 'media_asset_id', asset_id)
  );
end;
$$;

revoke all on function public.can_submit_member_event_archive(uuid,uuid) from public;
grant execute on function public.can_submit_member_event_archive(uuid,uuid) to authenticated;
revoke all on function public.can_submit_event_media(uuid,uuid) from public;
grant execute on function public.can_submit_event_media(uuid,uuid) to authenticated;
revoke all on function public.event_media_submission_path_allowed(text) from public;
grant execute on function public.event_media_submission_path_allowed(text) to authenticated;
revoke all on function public.get_my_member_event_archive(uuid) from public;
grant execute on function public.get_my_member_event_archive(uuid) to authenticated;
revoke all on function public.list_my_event_media_submissions(uuid) from public;
grant execute on function public.list_my_event_media_submissions(uuid) to authenticated;
revoke all on function public.save_member_event_archive(uuid,text,text,text[],uuid,boolean) from public;
grant execute on function public.save_member_event_archive(uuid,text,text,text[],uuid,boolean) to authenticated;
revoke all on function public.submit_event_media(uuid,text,text,text,text,text,timestamptz,boolean) from public;
grant execute on function public.submit_event_media(uuid,text,text,text,text,text,timestamptz,boolean) to authenticated;
revoke all on function public.withdraw_event_media_submission(uuid) from public;
grant execute on function public.withdraw_event_media_submission(uuid) to authenticated;
revoke all on function public.list_admin_member_event_archives() from public;
grant execute on function public.list_admin_member_event_archives() to authenticated;
revoke all on function public.list_admin_event_media_submissions() from public;
grant execute on function public.list_admin_event_media_submissions() to authenticated;
revoke all on function public.review_member_event_archive(uuid,text,text) from public;
grant execute on function public.review_member_event_archive(uuid,text,text) to authenticated;
revoke all on function public.review_event_media_submission(uuid,text,text) from public;
grant execute on function public.review_event_media_submission(uuid,text,text) to authenticated;

comment on table public.member_event_archive_submissions is
  'Event Host recap drafts. Admin approval publishes into the canonical event recap and may link one approved Community.';
comment on table public.member_event_media_submissions is
  'Consent-confirmed Host and attendee image submissions. Images remain private until Admin approval publishes canonical media metadata.';
comment on table public.event_community_continuations is
  'Public continuation from a completed member-hosted event into one approved Community; no membership is created by this link.';

commit;
