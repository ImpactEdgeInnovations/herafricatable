begin;

alter table public.communities
  add column if not exists public_preview_enabled boolean not null default false;
alter table public.communities
  add column if not exists about_summary text
    check (about_summary is null or char_length(about_summary) between 60 and 900);
alter table public.communities
  add column if not exists audience_summary text
    check (audience_summary is null or char_length(audience_summary) between 20 and 400);
alter table public.communities
  add column if not exists about_benefits text[] not null default array[]::text[]
    check (cardinality(about_benefits) between 0 and 6);
alter table public.communities
  add column if not exists host_display_name text
    check (host_display_name is null or char_length(host_display_name) between 2 and 100);
alter table public.communities
  add column if not exists host_intro text
    check (host_intro is null or char_length(host_intro) between 20 and 600);
alter table public.communities
  add column if not exists show_public_member_count boolean not null default false;
alter table public.communities
  add column if not exists public_preview_updated_by uuid
    references auth.users(id) on delete set null;
alter table public.communities
  add column if not exists public_preview_updated_at timestamptz;

create or replace function public.enforce_community_public_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'published' then
    new.public_preview_enabled := false;
    return new;
  end if;

  if not new.public_preview_enabled then
    return new;
  end if;

  if not public.communities_enabled() then
    raise exception 'Communities must be enabled before sharing a public page';
  end if;
  if not public.community_release_ready(new.id) then
    raise exception 'Community release acceptance must pass before sharing a public page';
  end if;
  if char_length(trim(coalesce(new.tagline, ''))) not between 3 and 140
    or char_length(trim(coalesce(new.about_summary, ''))) not between 60 and 900
    or char_length(trim(coalesce(new.audience_summary, ''))) not between 20 and 400
    or char_length(trim(coalesce(new.host_display_name, ''))) not between 2 and 100
    or char_length(trim(coalesce(new.host_intro, ''))) not between 20 and 600
    or cardinality(new.about_benefits) not between 3 and 6
    or exists (
      select 1
      from unnest(new.about_benefits) benefit
      where char_length(trim(benefit)) not between 8 and 180
    )
  then
    raise exception 'Complete every required public Community field before sharing';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_community_public_profile_before_insert
  on public.communities;
create trigger enforce_community_public_profile_before_insert
before insert on public.communities
for each row execute function public.enforce_community_public_profile();

drop trigger if exists enforce_community_public_profile_before_update
  on public.communities;
create trigger enforce_community_public_profile_before_update
before update of
  status,
  public_preview_enabled,
  tagline,
  about_summary,
  audience_summary,
  about_benefits,
  host_display_name,
  host_intro
on public.communities
for each row execute function public.enforce_community_public_profile();

create or replace function public.get_community_public_profile_admin(
  p_community_id uuid
)
returns table(
  community_id uuid,
  public_preview_enabled boolean,
  about_summary text,
  audience_summary text,
  about_benefits text[],
  host_display_name text,
  host_intro text,
  show_public_member_count boolean,
  release_ready boolean,
  community_status text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_admin(array['super_admin']::public.app_role[])
    or exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
        and membership.role = 'owner'
    )
  ) then
    raise exception 'Community owner required';
  end if;

  return query
  select
    community.id,
    community.public_preview_enabled,
    community.about_summary,
    community.audience_summary,
    community.about_benefits,
    community.host_display_name,
    community.host_intro,
    community.show_public_member_count,
    public.community_release_ready(community.id),
    community.status,
    community.public_preview_updated_at
  from public.communities community
  where community.id = p_community_id;
end;
$$;

create or replace function public.save_community_public_profile(
  p_community_id uuid,
  p_public_preview_enabled boolean,
  p_about_summary text,
  p_audience_summary text,
  p_about_benefits text[],
  p_host_display_name text,
  p_host_intro text,
  p_show_public_member_count boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_about text := nullif(trim(coalesce(p_about_summary, '')), '');
  clean_audience text := nullif(trim(coalesce(p_audience_summary, '')), '');
  clean_host_name text := nullif(trim(coalesce(p_host_display_name, '')), '');
  clean_host_intro text := nullif(trim(coalesce(p_host_intro, '')), '');
  clean_benefits text[];
begin
  if not (
    public.is_admin(array['super_admin']::public.app_role[])
    or exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = actor
        and membership.status = 'active'
        and membership.role = 'owner'
    )
  ) then
    raise exception 'Community owner required';
  end if;

  select coalesce(array_agg(trim(benefit) order by position), array[]::text[])
  into clean_benefits
  from unnest(coalesce(p_about_benefits, array[]::text[]))
    with ordinality as item(benefit, position)
  where nullif(trim(benefit), '') is not null;

  if cardinality(clean_benefits) > 6
    or exists (
      select 1
      from unnest(clean_benefits) benefit
      where char_length(benefit) not between 8 and 180
    )
  then
    raise exception 'Use up to six clear benefits of 8 to 180 characters';
  end if;
  if clean_about is not null and char_length(clean_about) not between 60 and 900 then
    raise exception 'Community overview must be 60 to 900 characters';
  end if;
  if clean_audience is not null and char_length(clean_audience) not between 20 and 400 then
    raise exception 'Member description must be 20 to 400 characters';
  end if;
  if clean_host_name is not null and char_length(clean_host_name) not between 2 and 100 then
    raise exception 'Host name must be 2 to 100 characters';
  end if;
  if clean_host_intro is not null and char_length(clean_host_intro) not between 20 and 600 then
    raise exception 'Host introduction must be 20 to 600 characters';
  end if;
  if p_public_preview_enabled and (
    clean_about is null
    or clean_audience is null
    or clean_host_name is null
    or clean_host_intro is null
    or cardinality(clean_benefits) not between 3 and 6
  ) then
    raise exception 'Complete the overview, audience, host and at least three benefits';
  end if;

  update public.communities
  set public_preview_enabled = coalesce(p_public_preview_enabled, false),
      about_summary = clean_about,
      audience_summary = clean_audience,
      about_benefits = clean_benefits,
      host_display_name = clean_host_name,
      host_intro = clean_host_intro,
      show_public_member_count = coalesce(p_show_public_member_count, false),
      public_preview_updated_by = actor,
      public_preview_updated_at = now(),
      updated_at = now()
  where id = p_community_id;
  if not found then
    raise exception 'Community not found';
  end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'community.public_profile_saved',
    'community',
    p_community_id,
    jsonb_build_object(
      'public_preview_enabled', coalesce(p_public_preview_enabled, false),
      'benefit_count', cardinality(clean_benefits),
      'shows_member_count', coalesce(p_show_public_member_count, false),
      'has_host_intro', clean_host_intro is not null
    )
  );
end;
$$;

create or replace function public.get_public_community_about(p_slug text)
returns table(
  community_id uuid,
  slug text,
  name text,
  tagline text,
  about_summary text,
  audience_summary text,
  about_benefits text[],
  accent_key text,
  icon_asset_id uuid,
  icon_alt_text text,
  icon_width integer,
  icon_height integer,
  cover_asset_id uuid,
  cover_alt_text text,
  cover_width integer,
  cover_height integer,
  host_display_name text,
  host_intro text,
  community_type text,
  member_count bigint,
  membership_status text,
  offer_access_type text,
  offer_price_minor bigint,
  offer_currency text,
  offer_billing_interval text,
  offer_payment_mode text,
  commerce_enabled boolean,
  next_event_slug text,
  next_event_title text,
  next_event_summary text,
  next_event_format text,
  next_event_starts_at timestamptz,
  next_event_city text,
  next_event_country text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.communities_enabled() then
    return;
  end if;

  return query
  select
    community.id,
    community.slug,
    community.name,
    community.tagline,
    community.about_summary,
    community.audience_summary,
    community.about_benefits,
    community.accent_key,
    icon.id,
    icon.alt_text,
    icon.width,
    icon.height,
    cover.id,
    cover.alt_text,
    cover.width,
    cover.height,
    community.host_display_name,
    community.host_intro,
    community.community_type,
    case
      when community.show_public_member_count then (
        select count(*)
        from public.community_memberships active_membership
        where active_membership.community_id = community.id
          and active_membership.status = 'active'
      )
      else null::bigint
    end,
    (
      select membership.status
      from public.community_memberships membership
      where membership.community_id = community.id
        and membership.user_id = auth.uid()
    ),
    offer.access_type,
    offer.price_minor,
    offer.currency,
    offer.billing_interval,
    offer.payment_mode,
    public.community_creator_commerce_enabled(),
    next_event.slug,
    next_event.title,
    next_event.summary,
    next_event.format,
    next_event.starts_at,
    next_event.city,
    next_event.country
  from public.communities community
  left join public.community_media_assets icon
    on icon.id = community.icon_asset_id
    and icon.status = 'active'
  left join public.community_media_assets cover
    on cover.id = community.cover_asset_id
    and cover.status = 'active'
  left join public.community_offers offer
    on offer.community_id = community.id
    and offer.status = 'published'
  left join lateral (
    select
      event.slug,
      event.title,
      event.summary,
      event.format,
      event.starts_at,
      venue.city,
      venue.country
    from public.community_event_links event_link
    join public.events event on event.id = event_link.event_id
    left join public.venues venue on venue.id = event.venue_id
    where event_link.community_id = community.id
      and event.status = 'published'
      and event.ends_at >= now()
    order by event_link.is_featured desc, event.starts_at
    limit 1
  ) next_event on true
  where community.slug = lower(trim(p_slug))
    and community.status = 'published'
    and community.public_preview_enabled
    and public.community_release_ready(community.id)
  limit 1;
end;
$$;

drop function if exists public.list_communities();
create function public.list_communities()
returns table(
  community_id uuid,
  slug text,
  name text,
  description text,
  community_type text,
  status text,
  membership_status text,
  membership_role text,
  member_count bigint,
  pending_count bigint,
  offer_id uuid,
  offer_access_type text,
  offer_price_minor bigint,
  offer_currency text,
  offer_billing_interval text,
  offer_payment_mode text,
  public_preview_enabled boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active membership required';
  end if;
  if not public.communities_enabled()
    and not public.is_admin(array['super_admin']::public.app_role[])
  then
    raise exception 'Communities are not available yet';
  end if;

  return query
  select
    community.id,
    community.slug,
    community.name,
    community.description,
    community.community_type,
    community.status,
    membership.status,
    membership.role,
    (
      select count(*)
      from public.community_memberships active_membership
      where active_membership.community_id = community.id
        and active_membership.status = 'active'
    ),
    (
      select count(*)
      from public.community_memberships pending_membership
      where pending_membership.community_id = community.id
        and pending_membership.status in (
          'requested',
          'invited',
          'approved_pending_payment'
        )
    ),
    offer.id,
    offer.access_type,
    offer.price_minor,
    offer.currency,
    offer.billing_interval,
    offer.payment_mode,
    community.public_preview_enabled
  from public.communities community
  left join public.community_memberships membership
    on membership.community_id = community.id
    and membership.user_id = auth.uid()
  left join public.community_offers offer
    on offer.community_id = community.id
    and offer.status = 'published'
  where community.status = 'published'
    or membership.user_id = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  order by
    case when membership.status = 'active' then 0 else 1 end,
    community.name;
end;
$$;

revoke all on function public.enforce_community_public_profile()
  from public, anon, authenticated;
revoke all on function public.get_community_public_profile_admin(uuid)
  from public;
grant execute on function public.get_community_public_profile_admin(uuid)
  to authenticated;
revoke all on function public.save_community_public_profile(
  uuid,
  boolean,
  text,
  text,
  text[],
  text,
  text,
  boolean
) from public;
grant execute on function public.save_community_public_profile(
  uuid,
  boolean,
  text,
  text,
  text[],
  text,
  text,
  boolean
) to authenticated;
revoke all on function public.get_public_community_about(text) from public;
grant execute on function public.get_public_community_about(text)
  to anon, authenticated;
revoke all on function public.list_communities() from public;
grant execute on function public.list_communities() to authenticated;

comment on function public.get_public_community_about(text) is
  'Opt-in public Community profile that omits posts, member identities, private event details and media storage paths.';
comment on function public.save_community_public_profile(
  uuid,
  boolean,
  text,
  text,
  text[],
  text,
  text,
  boolean
) is 'Owner-only, audited public Community profile editor with release-gate enforcement.';

commit;
