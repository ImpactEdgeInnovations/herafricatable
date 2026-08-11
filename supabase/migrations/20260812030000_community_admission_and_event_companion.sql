begin;

alter table public.communities
  add column if not exists admission_mode text not null default 'open'
  check (admission_mode in ('open', 'approval'));

update public.communities
set admission_mode = 'approval'
where community_type = 'private';

create or replace function public.keep_private_community_approval_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.community_type = 'private' then
    new.admission_mode := 'approval';
  end if;
  return new;
end;
$$;

drop trigger if exists communities_private_admission_guard on public.communities;
create trigger communities_private_admission_guard
before insert or update of community_type, admission_mode on public.communities
for each row execute function public.keep_private_community_approval_only();

create or replace function public.list_community_joining_settings(
  p_community_id uuid default null
)
returns table(
  community_id uuid,
  community_type text,
  admission_mode text,
  effective_mode text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  return query
  select
    community.id,
    community.community_type,
    community.admission_mode,
    case
      when community.community_type = 'private' then 'approval'
      else community.admission_mode
    end
  from public.communities community
  where (p_community_id is null or community.id = p_community_id)
    and (
      public.is_admin(array['super_admin']::public.app_role[])
      or public.can_manage_community(community.id)
      or (
        community.status = 'published'
        and public.is_active_member(auth.uid())
        and public.communities_enabled()
      )
    )
  order by community.name;
end;
$$;

create or replace function public.save_community_joining_mode(
  p_community_id uuid,
  p_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.communities%rowtype;
  owner_access boolean := false;
begin
  if p_mode not in ('open', 'approval') then
    raise exception 'Choose open joining or host approval';
  end if;

  select * into target
  from public.communities
  where id = p_community_id
  for update;
  if not found then raise exception 'Community not found'; end if;

  select
    public.is_admin(array['super_admin']::public.app_role[])
    or exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
        and membership.role = 'owner'
    )
  into owner_access;
  if not owner_access then raise exception 'Community owner or Super Admin required'; end if;

  if target.community_type = 'private' and p_mode <> 'approval' then
    raise exception 'Private communities always require host approval';
  end if;

  update public.communities
  set admission_mode = p_mode,
      updated_at = now()
  where id = p_community_id;

  insert into public.audit_events(
    actor_id, action, target_type, target_id, metadata
  ) values (
    auth.uid(),
    'community.joining_mode_changed',
    'community',
    p_community_id,
    jsonb_build_object(
      'previous_mode', target.admission_mode,
      'new_mode', p_mode,
      'community_type', target.community_type
    )
  );
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
  needs_approval boolean := false;
  next_status text;
  host record;
  member_name text;
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
  needs_approval := target.community_type = 'private'
    or target.admission_mode = 'approval';
  next_status := case
    when needs_approval then 'requested'
    when paid_offer and not current_access then 'approved_pending_payment'
    else 'active'
  end;

  insert into public.community_memberships(
    community_id, user_id, role, status, joined_at
  ) values (
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
      reviewed_by = null,
      updated_at = now()
  where public.community_memberships.status in ('declined', 'removed');
  if not found then raise exception 'Membership already exists'; end if;

  if next_status = 'requested' then
    select coalesce(nullif(trim(profile.display_name), ''), 'A member')
    into member_name
    from public.profiles profile
    where profile.id = actor;

    for host in
      select membership.user_id
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.status = 'active'
        and membership.role in ('owner', 'moderator')
    loop
      perform public.enqueue_notification(
        host.user_id,
        'community',
        'New request to join ' || target.name,
        coalesce(member_name, 'A member') || ' would like to join. Review the request in your Community controls.',
        '/communities/' || target.slug || '/host#admissions',
        'community-join-request:' || p_community_id || ':' || actor
      );
    end loop;
  end if;

  insert into public.audit_events(
    actor_id, action, target_type, target_id, metadata
  ) values (
    actor,
    'community.membership_' || next_status,
    'community',
    p_community_id,
    jsonb_build_object(
      'status', next_status,
      'paid_offer', paid_offer,
      'admission_mode', target.admission_mode,
      'existing_access_preserved', current_access,
      'acceptance_rehearsal', target.status = 'draft'
    )
  );
end;
$$;

create or replace function public.notify_community_membership_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  community_name text;
  community_slug text;
begin
  if old.status <> 'requested' or new.status not in ('active', 'declined') then
    return new;
  end if;

  select community.name, community.slug
  into community_name, community_slug
  from public.communities community
  where community.id = new.community_id;

  perform public.enqueue_notification(
    new.user_id,
    'community',
    case when new.status = 'active'
      then 'Welcome to ' || community_name
      else 'Update on your request to ' || community_name
    end,
    case when new.status = 'active'
      then 'Your request was approved. The Community is now open to you.'
      else 'The host was not able to approve this request. You may contact support if you need help.'
    end,
    case when new.status = 'active'
      then '/communities/' || community_slug
      else '/communities'
    end,
    'community-join-decision:' || new.id || ':' || new.status
  );

  return new;
end;
$$;

drop trigger if exists community_membership_decision_notification
  on public.community_memberships;
create trigger community_membership_decision_notification
after update of status on public.community_memberships
for each row execute function public.notify_community_membership_decision();

revoke all on function public.list_community_joining_settings(uuid) from public;
grant execute on function public.list_community_joining_settings(uuid) to authenticated;
revoke all on function public.save_community_joining_mode(uuid, text) from public;
grant execute on function public.save_community_joining_mode(uuid, text) to authenticated;
revoke all on function public.request_community_access(uuid) from public;
grant execute on function public.request_community_access(uuid) to authenticated;

comment on column public.communities.admission_mode is
  'Open allows immediate entry for active Her Africa Table members; approval sends a request to the Community owner or moderator.';
comment on function public.save_community_joining_mode(uuid, text) is
  'Lets the Community owner or Super Admin choose open joining or host approval. Private Communities always require approval.';

commit;
