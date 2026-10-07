begin;

-- A Community's joining rule is distinct from its draft/public-page state.
-- Existing private rooms remain approval-based unless their owner changes it.
alter table public.communities add column if not exists join_policy text
  not null default 'approval'
  check (join_policy in ('open','approval','invite_only'));
update public.communities
set join_policy = case
  when community_type = 'official' and admission_mode = 'open' then 'open'
  else 'approval' end;

alter table public.community_host_applications
  drop constraint if exists community_host_applications_admission_model_check;
alter table public.community_host_applications
  add constraint community_host_applications_admission_model_check
  check (admission_model in
    ('application_review','invitation_only','open_request','open_join'));

-- Preserve the existing application validation/audit while accepting the new,
-- unambiguous "any member can join" choice.
alter function public.save_community_host_application(
  uuid,text,text,text,text,integer,text,text,text,text,boolean
) rename to save_community_host_application_core;
revoke all on function public.save_community_host_application_core(
  uuid,text,text,text,text,integer,text,text,text,text,boolean
) from public, anon, authenticated;

create or replace function public.save_community_host_application(
  p_application_id uuid, p_community_name text, p_category text,
  p_purpose text, p_intended_members text, p_expected_members integer,
  p_admission_model text, p_host_experience text, p_safety_plan text,
  p_applicant_message text, p_accept_guidelines boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved uuid;
begin
  if p_admission_model not in
    ('application_review','invitation_only','open_request','open_join') then
    raise exception 'Choose who can join your Community';
  end if;
  saved := public.save_community_host_application_core(
    p_application_id,p_community_name,p_category,p_purpose,
    p_intended_members,p_expected_members,
    case when p_admission_model = 'open_join' then 'open_request'
      else p_admission_model end,
    p_host_experience,p_safety_plan,p_applicant_message,p_accept_guidelines);
  if p_admission_model = 'open_join' then
    update public.community_host_applications
    set admission_model = 'open_join', updated_at = now()
    where id = saved and applicant_id = auth.uid();
  end if;
  return saved;
end;
$$;
revoke all on function public.save_community_host_application(
  uuid,text,text,text,text,integer,text,text,text,text,boolean
) from public, anon;
grant execute on function public.save_community_host_application(
  uuid,text,text,text,text,integer,text,text,text,text,boolean
) to authenticated;

create or replace function public.sync_community_join_policy_from_application()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.created_community_id is not null and
    (tg_op = 'INSERT' or old.created_community_id is distinct from new.created_community_id
      or old.admission_model is distinct from new.admission_model) then
    update public.communities set join_policy = case new.admission_model
      when 'open_join' then 'open'
      when 'invitation_only' then 'invite_only'
      else 'approval' end,
      updated_at = now()
    where id = new.created_community_id and created_by = new.applicant_id
      and status = 'draft';
  end if;
  return new;
end;
$$;
revoke all on function public.sync_community_join_policy_from_application()
  from public, anon;
drop trigger if exists community_application_join_policy
  on public.community_host_applications;
create trigger community_application_join_policy
after insert or update of created_community_id,admission_model
on public.community_host_applications
for each row execute function public.sync_community_join_policy_from_application();

-- Existing pilot drafts retain the choice their Hosts submitted.
update public.communities community
set join_policy = case application.admission_model
  when 'open_join' then 'open'
  when 'invitation_only' then 'invite_only'
  else 'approval' end
from public.community_host_applications application
where application.created_community_id = community.id
  and community.status = 'draft';

create or replace function public.list_community_joining_settings(
  p_community_id uuid default null
)
returns table(community_id uuid, community_type text,
  admission_mode text, effective_mode text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  return query
  select community.id,community.community_type,community.admission_mode,
    community.join_policy
  from public.communities community
  where (p_community_id is null or community.id = p_community_id)
    and (public.is_admin(array['super_admin']::public.app_role[])
      or public.can_manage_community(community.id)
      or (community.status = 'published'
        and public.is_active_member(auth.uid())
        and public.communities_enabled()
        and (community.join_policy <> 'invite_only'
          or exists (select 1 from public.community_memberships member
            where member.community_id = community.id and member.user_id = auth.uid()))))
  order by community.name;
end;
$$;
revoke all on function public.list_community_joining_settings(uuid)
  from public, anon;
grant execute on function public.list_community_joining_settings(uuid)
  to authenticated;

create or replace function public.save_community_joining_mode(
  p_community_id uuid, p_mode text
)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.communities%rowtype;
begin
  if p_mode not in ('open','approval','invite_only') then
    raise exception 'Choose who can join your Community';
  end if;
  select * into target from public.communities
  where id = p_community_id for update;
  if not found then raise exception 'Community not found'; end if;
  if not public.is_admin(array['super_admin']::public.app_role[])
    and not exists (select 1 from public.community_memberships member
      where member.community_id = p_community_id
        and member.user_id = auth.uid()
        and member.status = 'active' and member.role = 'owner') then
    raise exception 'Community owner or Super Admin required';
  end if;
  update public.communities set join_policy = p_mode,
    admission_mode = case when p_mode = 'open' and community_type <> 'private'
      then 'open' else 'approval' end,
    updated_at = now() where id = p_community_id;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values (auth.uid(),'community.joining_mode_changed','community',p_community_id,
    jsonb_build_object('previous_mode',target.join_policy,'new_mode',p_mode));
end;
$$;
revoke all on function public.save_community_joining_mode(uuid,text)
  from public, anon;
grant execute on function public.save_community_joining_mode(uuid,text)
  to authenticated;

create or replace function public.request_community_access(p_community_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.communities%rowtype;
  paid_offer boolean := false; current_access boolean := false;
  next_status text; host record; member_name text;
  rehearsal_actor boolean := public.is_community_rehearsal_actor();
begin
  if not public.communities_enabled() or not public.is_active_member(actor) then
    raise exception 'Communities are unavailable';
  end if;
  select * into target from public.communities
  where id = p_community_id and
    (status = 'published' or (status = 'draft' and rehearsal_actor));
  if not found then raise exception 'Community not found'; end if;
  if target.join_policy = 'invite_only' then
    raise exception 'This Community is by invitation only. Ask its Host for an invitation';
  end if;
  select exists (select 1 from public.community_offers offer
    where offer.community_id = p_community_id
      and offer.status = 'published' and offer.access_type = 'paid')
  into paid_offer;
  current_access := public.has_current_community_access(p_community_id,actor);
  next_status := case
    when target.join_policy = 'approval' then 'requested'
    when paid_offer and not current_access then 'approved_pending_payment'
    else 'active' end;

  insert into public.community_memberships(
    community_id,user_id,role,status,joined_at)
  values (p_community_id,actor,'member',next_status,
    case when next_status = 'active' then now() end)
  on conflict(community_id,user_id) do update
    set role = 'member', status = excluded.status,
      joined_at = case when excluded.status = 'active'
        then coalesce(public.community_memberships.joined_at,now())
        else public.community_memberships.joined_at end,
      reviewed_by = null, updated_at = now()
    where public.community_memberships.status in ('declined','removed');
  if not found then raise exception 'Membership already exists'; end if;

  if next_status in ('requested','active') then
    select coalesce(nullif(trim(profile.display_name),''),'A member')
      into member_name from public.profiles profile where profile.id = actor;
    for host in select member.user_id from public.community_memberships member
      where member.community_id = p_community_id
        and member.status = 'active' and member.role in ('owner','moderator')
        and member.user_id <> actor
    loop
      perform public.enqueue_notification(host.user_id,'community',
        case when next_status = 'active' then 'A member joined ' || target.name
          else 'New request to join ' || target.name end,
        case when next_status = 'active'
          then coalesce(member_name,'A member') || ' has joined your Community.'
          else coalesce(member_name,'A member') ||
            ' would like to join. Review the request in your Community controls.' end,
        '/communities/' || target.slug || '/host#admissions',
        'community-join-' || next_status || ':' || p_community_id || ':' || actor);
    end loop;
  end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values (actor,'community.membership_' || next_status,'community',p_community_id,
    jsonb_build_object('status',next_status,'paid_offer',paid_offer,
      'join_policy',target.join_policy,'existing_access_preserved',current_access,
      'acceptance_rehearsal',target.status = 'draft'));
end;
$$;
revoke all on function public.request_community_access(uuid)
  from public, anon;
grant execute on function public.request_community_access(uuid)
  to authenticated;

-- Do not leak invitation-only Community names/descriptions in discovery.
alter function public.list_communities() rename to list_communities_core;
revoke all on function public.list_communities_core()
  from public, anon, authenticated;
create or replace function public.list_communities()
returns table(community_id uuid,slug text,name text,description text,
  community_type text,status text,membership_status text,
  membership_role text,member_count bigint,pending_count bigint,
  offer_id uuid,offer_access_type text,offer_price_minor bigint,
  offer_currency text,offer_billing_interval text,offer_payment_mode text,
  public_preview_enabled boolean)
language sql stable security definer set search_path = '' as $$
  select listed.* from public.list_communities_core() listed
  join public.communities community on community.id = listed.community_id
  where community.join_policy <> 'invite_only'
    or listed.membership_status is not null
    or public.is_admin(array['super_admin']::public.app_role[]);
$$;
revoke all on function public.list_communities() from public, anon;
grant execute on function public.list_communities() to authenticated;

notify pgrst, 'reload schema';
commit;
