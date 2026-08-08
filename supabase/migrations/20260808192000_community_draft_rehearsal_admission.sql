begin;

create or replace function public.is_community_rehearsal_actor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select flag.enabled
      from public.feature_flags flag
      where flag.key = 'community_acceptance_mode'
    ), false)
    and exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.is_test_account
        and profile.access_status = 'active'
    )
$$;

create or replace function public.list_communities()
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
declare
  rehearsal_actor boolean := public.is_community_rehearsal_actor();
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
    or (community.status = 'draft' and rehearsal_actor)
  order by
    case when membership.status = 'active' then 0 else 1 end,
    community.name;
end;
$$;

create or replace function public.request_community_access(
  p_community_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.communities%rowtype;
  paid_offer boolean := false;
  current_access boolean := false;
  next_status text;
  rehearsal_actor boolean := public.is_community_rehearsal_actor();
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor)
  then
    raise exception 'Communities are unavailable';
  end if;

  select * into target
  from public.communities
  where id = p_community_id
    and (
      status = 'published'
      or (status = 'draft' and rehearsal_actor)
    );
  if not found then raise exception 'Community not found'; end if;

  select exists (
    select 1
    from public.community_offers offer
    where offer.community_id = p_community_id
      and offer.status = 'published'
      and offer.access_type = 'paid'
  ) into paid_offer;
  current_access := public.has_current_community_access(p_community_id, actor);

  next_status := case
    when target.community_type = 'private' then 'requested'
    when paid_offer and not current_access then 'approved_pending_payment'
    else 'active'
  end;

  insert into public.community_memberships(
    community_id,
    user_id,
    role,
    status,
    joined_at
  )
  values(
    p_community_id,
    actor,
    'member',
    next_status,
    case when next_status = 'active' then now() end
  )
  on conflict(community_id, user_id) do update
  set role = 'member',
      status = excluded.status,
      joined_at = case
        when excluded.status = 'active'
          then coalesce(public.community_memberships.joined_at, now())
        else public.community_memberships.joined_at
      end,
      updated_at = now()
  where public.community_memberships.status in ('declined', 'removed');
  if not found then raise exception 'Membership already exists'; end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    actor,
    'community.membership_' || next_status,
    'community',
    p_community_id,
    jsonb_build_object(
      'status', next_status,
      'paid_offer', paid_offer,
      'existing_access_preserved', current_access,
      'acceptance_rehearsal', target.status = 'draft'
    )
  );
end;
$$;

revoke all on function public.is_community_rehearsal_actor()
  from public, anon, authenticated;
revoke all on function public.list_communities() from public;
grant execute on function public.list_communities() to authenticated;
revoke all on function public.request_community_access(uuid) from public;
grant execute on function public.request_community_access(uuid)
  to authenticated;

comment on function public.is_community_rehearsal_actor() is
  'True only for an active tagged test account while controlled Community acceptance mode is enabled.';
comment on function public.request_community_access(uuid) is
  'Production admission plus draft-only rehearsal access for tagged test accounts behind the acceptance flag.';

commit;
