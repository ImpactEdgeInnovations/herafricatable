begin;

alter table public.community_posts
  add column if not exists edited_at timestamptz;

create table if not exists public.community_post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete restrict,
  previous_body text not null
    check (char_length(previous_body) between 2 and 3000),
  previous_edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_post_revisions_post_idx
  on public.community_post_revisions(post_id, created_at desc);

alter table public.community_post_revisions enable row level security;

revoke all on table public.community_post_revisions
  from public, anon, authenticated;

create or replace function public.list_community_post_edit_states(
  p_community_id uuid,
  p_limit integer default 100
)
returns table(
  post_id uuid,
  edited_at timestamptz,
  can_edit boolean,
  edit_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.communities_enabled()
    or not public.is_active_member(auth.uid())
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    ) then
    raise exception 'Active community membership required';
  end if;

  return query
  select
    post.id,
    post.edited_at,
    post.author_id = auth.uid()
      and post.created_at > now() - interval '30 minutes'
      and not post.is_pinned
      and (
        select count(*)
        from public.community_post_revisions revision
        where revision.post_id = post.id
      ) < 5,
    post.created_at + interval '30 minutes'
  from public.community_posts post
  join public.profiles author on author.id = post.author_id
  where post.community_id = p_community_id
    and post.parent_post_id is null
    and post.status = 'published'
    and author.access_status = 'active'
    and not public.is_blocked_pair(auth.uid(), post.author_id)
  order by post.is_pinned desc, post.pinned_at desc nulls last, post.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

create or replace function public.edit_community_post(
  p_post_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_posts%rowtype;
  clean_body text := trim(coalesce(p_body, ''));
  revision_number integer;
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor) then
    raise exception 'Communities are unavailable';
  end if;

  select *
  into target
  from public.community_posts
  where id = p_post_id
    and parent_post_id is null
    and status = 'published'
  for update;

  if not found
    or target.author_id <> actor
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.user_id = actor
        and membership.status = 'active'
    ) then
    raise exception 'Conversation is unavailable';
  end if;

  if target.created_at <= now() - interval '30 minutes' then
    raise exception 'The 30-minute editing window has closed';
  end if;

  if target.is_pinned then
    raise exception 'Unpin this conversation before editing it';
  end if;

  if char_length(clean_body) not between 2 and 3000 then
    raise exception 'Post must be between 2 and 3000 characters';
  end if;

  if clean_body = target.body then
    raise exception 'Make a change before saving';
  end if;

  select count(*)::integer
  into revision_number
  from public.community_post_revisions revision
  where revision.post_id = p_post_id;

  if revision_number >= 5 then
    raise exception 'The revision limit has been reached';
  end if;

  insert into public.community_post_revisions(
    post_id,
    editor_id,
    previous_body,
    previous_edited_at
  )
  values (
    p_post_id,
    actor,
    target.body,
    target.edited_at
  );

  update public.community_posts
  set
    body = clean_body,
    edited_at = now(),
    updated_at = now()
  where id = p_post_id;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'community.post_edited',
    'community_post',
    p_post_id,
    jsonb_build_object(
      'community_id', target.community_id,
      'revision_number', revision_number + 1
    )
  );
end;
$$;

create or replace function public.report_community_post(
  p_post_id uuid,
  p_category text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_posts%rowtype;
  saved uuid;
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor) then
    raise exception 'Communities are unavailable';
  end if;

  select *
  into target
  from public.community_posts
  where id = p_post_id
    and status = 'published'
    and author_id <> actor;

  if not found
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.user_id = actor
        and membership.status = 'active'
    ) then
    raise exception 'Community content unavailable';
  end if;

  if p_category not in (
    'harassment',
    'privacy',
    'spam',
    'misinformation',
    'safety',
    'other'
  )
    or char_length(trim(coalesce(p_details, ''))) not between 10 and 2000 then
    raise exception 'Valid report details are required';
  end if;

  insert into public.community_post_reports(
    post_id,
    reporter_id,
    category,
    details,
    evidence_snapshot
  )
  values(
    p_post_id,
    actor,
    p_category,
    trim(p_details),
    jsonb_build_object(
      'post_id', target.id,
      'parent_post_id', target.parent_post_id,
      'content_kind', case
        when target.parent_post_id is null then 'post'
        else 'comment'
      end,
      'community_id', target.community_id,
      'author_id', target.author_id,
      'body', target.body,
      'edited_at', target.edited_at,
      'prior_versions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'body', revision.previous_body,
            'edited_at', revision.previous_edited_at,
            'replaced_at', revision.created_at
          )
          order by revision.created_at
        )
        from public.community_post_revisions revision
        where revision.post_id = target.id
      ), '[]'::jsonb),
      'attachment', (
        select jsonb_build_object(
          'asset_id', asset.id,
          'asset_kind', asset.asset_kind,
          'storage_path', asset.storage_path,
          'external_url', asset.external_url,
          'original_name', asset.original_name,
          'mime_type', asset.mime_type,
          'size_bytes', asset.size_bytes,
          'alt_text', asset.alt_text
        )
        from public.community_media_assets asset
        where asset.post_id = target.id
          and asset.status = 'active'
        limit 1
      ),
      'captured_at', now()
    )
  )
  returning id into saved;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    actor,
    'community.content_reported',
    'community_post_report',
    saved,
    jsonb_build_object(
      'post_id', p_post_id,
      'content_kind', case
        when target.parent_post_id is null then 'post'
        else 'comment'
      end
    )
  );

  return saved;
exception
  when unique_violation then
    raise exception 'You already have an active report for this content';
end;
$$;

revoke all on function public.list_community_post_edit_states(uuid, integer)
  from public;
grant execute on function public.list_community_post_edit_states(uuid, integer)
  to authenticated;

revoke all on function public.edit_community_post(uuid, text)
  from public;
grant execute on function public.edit_community_post(uuid, text)
  to authenticated;

revoke all on function public.report_community_post(uuid, text, text)
  from public;
grant execute on function public.report_community_post(uuid, text, text)
  to authenticated;

comment on table public.community_post_revisions is
  'Private, immutable edit evidence. No member or moderator browse access; copied only into an evidence snapshot when content is reported.';
comment on function public.edit_community_post is
  'Allows an author to make at most five revisions during the first 30 minutes, while retaining report-scoped safety evidence.';

commit;
