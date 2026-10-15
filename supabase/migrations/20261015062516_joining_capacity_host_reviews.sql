begin;

-- Limits are optional. Existing Communities retain unlimited membership.
create table public.community_join_limits (
  community_id uuid primary key references public.communities(id) on delete cascade,
  maximum_members integer check (maximum_members between 2 and 100000),
  waiting_list_enabled boolean not null default true,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table public.community_join_waitlist (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (community_id,user_id)
);
create index community_join_waitlist_order on public.community_join_waitlist(community_id,joined_at,user_id);
create table public.community_join_decisions (
  membership_id uuid primary key references public.community_memberships(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 500),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now()
);
alter table public.community_join_limits enable row level security;
alter table public.community_join_waitlist enable row level security;
alter table public.community_join_decisions enable row level security;
-- These records are accessed only through narrowly projected, guarded APIs.
revoke all on public.community_join_limits,public.community_join_waitlist,public.community_join_decisions from public,anon,authenticated;
grant select on public.community_join_limits,public.community_join_waitlist,public.community_join_decisions to authenticated;
create policy community_limit_read on public.community_join_limits for select to authenticated using (
  public.can_manage_community(community_id) or (public.is_active_member(auth.uid()) and exists(select 1 from public.communities c where c.id=community_id and c.status='published')));
create policy community_waitlist_private_read on public.community_join_waitlist for select to authenticated using (user_id=auth.uid() or public.can_manage_community(community_id));
create policy community_decision_private_read on public.community_join_decisions for select to authenticated using (user_id=auth.uid() or public.can_manage_community(community_id));

create table public.community_application_join_limits (
  application_id uuid primary key references public.community_host_applications(id) on delete cascade,
  maximum_members integer check(maximum_members between 2 and 100000),
  waiting_list_enabled boolean not null default true
);
alter table public.community_application_join_limits enable row level security;
revoke all on public.community_application_join_limits from public,anon,authenticated;
grant select on public.community_application_join_limits to authenticated;
create policy community_application_limit_private on public.community_application_join_limits for select to authenticated using (
  exists(select 1 from public.community_host_applications a where a.id=application_id and a.applicant_id=auth.uid()) or public.is_admin(array['super_admin']::public.app_role[]));

create function public.sync_community_application_member_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.created_community_id is not null and (tg_op='INSERT' or old.created_community_id is distinct from new.created_community_id) then
    insert into public.community_join_limits(community_id,maximum_members,waiting_list_enabled,updated_by)
    select new.created_community_id,l.maximum_members,l.waiting_list_enabled,new.applicant_id from public.community_application_join_limits l where l.application_id=new.id
    on conflict(community_id) do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.sync_community_application_member_limit() from public,anon,authenticated;
create trigger sync_community_application_member_limit after insert or update of created_community_id on public.community_host_applications for each row execute function public.sync_community_application_member_limit();

create function public.save_community_host_application_with_limits(
  p_application_id uuid,p_community_name text,p_category text,p_purpose text,p_intended_members text,
  p_expected_members integer,p_admission_model text,p_host_experience text,p_safety_plan text,
  p_applicant_message text,p_accept_guidelines boolean,p_location_scope text,p_location_label text,
  p_maximum_members integer default null,p_waiting_list boolean default true
) returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid; created uuid;
begin
  if auth.uid() is null or not public.is_active_member(auth.uid()) then raise exception 'Active membership required'; end if;
  if p_maximum_members is not null and p_maximum_members not between 2 and 100000 then raise exception 'Choose at least 2 members, or leave the limit blank'; end if;
  saved:=public.save_community_host_application_with_location(
    p_application_id=>p_application_id,p_community_name=>p_community_name,p_category=>p_category,
    p_purpose=>p_purpose,p_intended_members=>p_intended_members,p_expected_members=>p_expected_members,
    p_admission_model=>p_admission_model,p_host_experience=>p_host_experience,p_safety_plan=>p_safety_plan,
    p_applicant_message=>p_applicant_message,p_accept_guidelines=>p_accept_guidelines,
    p_location_scope=>p_location_scope,p_location_label=>p_location_label);
  insert into public.community_application_join_limits values(saved,p_maximum_members,coalesce(p_waiting_list,true))
  on conflict(application_id) do update set maximum_members=excluded.maximum_members,waiting_list_enabled=excluded.waiting_list_enabled;
  select created_community_id into created from public.community_host_applications where id=saved and applicant_id=auth.uid();
  if created is not null then perform public.save_community_join_limit(created,p_maximum_members,p_waiting_list); end if;
  return saved;
end; $$;

create function public.enforce_community_member_limit() returns trigger
language plpgsql security definer set search_path='' as $$
declare maximum integer; occupied bigint;
begin
  if new.status not in ('active','approved_pending_payment') then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.community_id::text || ':member-limit',0));
  select maximum_members into maximum from public.community_join_limits where community_id=new.community_id;
  if maximum is null then return new; end if;
  select count(*) into occupied from public.community_memberships
  where community_id=new.community_id and status in ('active','approved_pending_payment') and id<>new.id;
  if occupied>=maximum then raise exception 'This Community is full. Keep the request waiting or free a place before approving it'; end if;
  return new;
end; $$;
revoke all on function public.enforce_community_member_limit() from public,anon,authenticated;
create trigger enforce_community_member_limit before insert or update of status,community_id on public.community_memberships
for each row execute function public.enforce_community_member_limit();

create function public.list_community_join_limits(p_community_id uuid default null)
returns table(community_id uuid,maximum_members integer,waiting_list_enabled boolean,occupied_members bigint,is_full boolean,on_waiting_list boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.communities_enabled() or not public.is_active_member(auth.uid()) then raise exception 'Active membership required'; end if;
  return query select c.id,l.maximum_members,coalesce(l.waiting_list_enabled,true),counts.occupied,
    l.maximum_members is not null and counts.occupied>=l.maximum_members,
    exists(select 1 from public.community_join_waitlist w where w.community_id=c.id and w.user_id=auth.uid())
  from public.communities c left join public.community_join_limits l on l.community_id=c.id
  cross join lateral(select count(*) as occupied from public.community_memberships m where m.community_id=c.id and m.status in ('active','approved_pending_payment')) counts
  where (p_community_id is null or c.id=p_community_id)
    and (c.status='published' or public.can_manage_community(c.id));
end; $$;

create function public.save_community_join_limit(p_community_id uuid,p_maximum integer,p_waiting_list boolean)
returns void language plpgsql security definer set search_path='' as $$
declare occupied bigint;
begin
  if auth.uid() is null or not public.can_manage_community(p_community_id) or not (
    public.is_admin(array['super_admin']::public.app_role[]) or exists(select 1 from public.community_memberships where community_id=p_community_id and user_id=auth.uid() and role='owner' and status='active')
  ) then raise exception 'Only the Community owner can change its member limit'; end if;
  if p_maximum is not null and p_maximum not between 2 and 100000 then raise exception 'Choose a limit of at least 2 members, or leave it blank'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_community_id::text || ':member-limit',0));
  select count(*) into occupied from public.community_memberships where community_id=p_community_id and status in ('active','approved_pending_payment');
  if p_maximum is not null and p_maximum<occupied then raise exception 'The limit cannot be below your current members and reserved places'; end if;
  insert into public.community_join_limits values(p_community_id,p_maximum,coalesce(p_waiting_list,true),auth.uid(),now())
  on conflict(community_id) do update set maximum_members=excluded.maximum_members,waiting_list_enabled=excluded.waiting_list_enabled,updated_by=auth.uid(),updated_at=now();
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'community.member_limit_changed','community',p_community_id,jsonb_build_object('maximum',p_maximum,'waiting_list',p_waiting_list));
end; $$;

create function public.join_community_with_capacity(p_community_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare c public.communities%rowtype; l public.community_join_limits%rowtype; occupied bigint; member_status text; host record; member_name text;
begin
  if auth.uid() is null or not public.communities_enabled() or not public.is_active_member(auth.uid()) then raise exception 'Active membership required'; end if;
  select * into c from public.communities where id=p_community_id and status='published';
  if not found then raise exception 'Community is not open'; end if;
  select status into member_status from public.community_memberships where community_id=c.id and user_id=auth.uid();
  if member_status in ('active','approved_pending_payment','requested') then raise exception 'You already joined or requested to join this Community'; end if;
  if c.join_policy='invite_only' and member_status is distinct from 'invited' then raise exception 'Ask the Host for a personal invitation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.id::text || ':member-limit',0));
  select * into l from public.community_join_limits where community_id=c.id;
  select count(*) into occupied from public.community_memberships where community_id=c.id and status in ('active','approved_pending_payment');
  if l.maximum_members is not null and occupied>=l.maximum_members then
    if not l.waiting_list_enabled then raise exception 'This Community is full. Its waiting list is closed'; end if;
    insert into public.community_join_waitlist(community_id,user_id) values(c.id,auth.uid()) on conflict do nothing;
    if found then
      select coalesce(nullif(display_name,''),'A member') into member_name from public.profiles where id=auth.uid();
      for host in select user_id from public.community_memberships where community_id=c.id and status='active' and role in ('owner','moderator') loop
        perform public.enqueue_notification(host.user_id,'community','New waiting-list request for '||c.name,member_name||' would like a place when one becomes available.','/communities/'||c.slug||'/host#member-limit','community-waitlist:'||c.id||':'||auth.uid());
      end loop;
    end if;
    return 'waitlisted';
  end if;
  if member_status='invited' then perform public.respond_to_community_invitation(c.id,true);
  else perform public.request_community_access(c.id); end if;
  delete from public.community_join_waitlist where community_id=c.id and user_id=auth.uid();
  select status into member_status from public.community_memberships where community_id=c.id and user_id=auth.uid();
  return member_status;
end; $$;

create function public.leave_community_waitlist(p_community_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from public.community_join_waitlist where community_id=p_community_id and user_id=auth.uid();
end; $$;

create function public.list_community_waiting_members(p_community_id uuid)
returns table(user_id uuid,display_name text,joined_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_manage_community(p_community_id) then raise exception 'Host access required'; end if;
  return query select w.user_id,p.display_name::text,w.joined_at from public.community_join_waitlist w join public.profiles p on p.id=w.user_id where w.community_id=p_community_id order by w.joined_at,w.user_id limit 100;
end; $$;

create function public.review_community_waiting_member(p_community_id uuid,p_user_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare c public.communities%rowtype; paid boolean; next_status text;
begin
  if auth.uid() is null or not public.can_manage_community(p_community_id) then raise exception 'Host access required'; end if;
  if p_action not in ('approve','decline') then raise exception 'Choose Approve or Decline'; end if;
  if p_action='decline' and char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Add a short reason of 5 to 500 characters'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_community_id::text || ':member-limit',0));
  select * into c from public.communities where id=p_community_id and status='published';
  if not found then raise exception 'Community is not open'; end if;
  perform 1 from public.community_join_waitlist where community_id=c.id and user_id=p_user_id for update;
  if not found then raise exception 'This waiting-list entry has already changed. Refresh the list'; end if;
  if p_action='approve' then
    if not public.is_active_member(p_user_id) then raise exception 'This person must have active platform membership'; end if;
    select exists(select 1 from public.community_offers where community_id=c.id and status='published' and access_type='paid') into paid;
    next_status:=case when paid then 'approved_pending_payment' else 'active' end;
    insert into public.community_memberships(community_id,user_id,role,status,reviewed_by,joined_at) values(c.id,p_user_id,'member',next_status,auth.uid(),case when not paid then now() end)
    on conflict(community_id,user_id) do update set status=excluded.status,role='member',reviewed_by=auth.uid(),joined_at=excluded.joined_at,updated_at=now() where public.community_memberships.status in ('invited','requested','declined','removed');
    if not found then raise exception 'This membership has already changed'; end if;
  end if;
  delete from public.community_join_waitlist where community_id=c.id and user_id=p_user_id;
  perform public.enqueue_notification(p_user_id,'community',case when p_action='approve' then 'A place is ready in '||c.name else 'Update from '||c.name end,
    case when p_action='decline' then 'The Host could not offer a place. '||trim(p_reason) when paid then 'The Host approved your place. Open the Community to complete payment.' else 'The Host approved your place. You can now join the conversation.' end,
    case when p_action='approve' and not paid then '/communities/'||c.slug else '/communities' end,'community-waitlist-decision:'||c.id||':'||p_user_id||':'||pg_catalog.txid_current());
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'community.waitlist_'||p_action,'community',c.id,jsonb_build_object('member_id',p_user_id));
end; $$;

create function public.review_community_join_request(p_membership_id uuid,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare m public.community_memberships%rowtype;
begin
  select * into m from public.community_memberships where id=p_membership_id for update;
  if not found or auth.uid() is null or not public.can_manage_community(m.community_id) then raise exception 'Host access required'; end if;
  if m.status<>'requested' or p_action not in ('approve','decline') then raise exception 'This request has changed. Refresh the list'; end if;
  if p_action='decline' then
    if char_length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Add a short reason of 5 to 500 characters'; end if;
    insert into public.community_join_decisions values(m.id,m.user_id,m.community_id,trim(p_reason),auth.uid(),now())
    on conflict(membership_id) do update set reason=excluded.reason,reviewed_by=auth.uid(),reviewed_at=now();
  else delete from public.community_join_decisions where membership_id=m.id; end if;
  perform public.review_community_membership(m.id,p_action);
end; $$;

create or replace function public.notify_community_membership_decision() returns trigger
language plpgsql security definer set search_path='' as $$
declare community_name text; community_slug text; reason text;
begin
  if old.status<>'requested' or new.status not in ('active','declined') then return new; end if;
  select name,slug into community_name,community_slug from public.communities where id=new.community_id;
  if new.status='declined' then select d.reason into reason from public.community_join_decisions d where d.membership_id=new.id; end if;
  perform public.enqueue_notification(new.user_id,'community',case when new.status='active' then 'Welcome to '||community_name else 'Update on your request to '||community_name end,
    case when new.status='active' then 'Your request was approved. The Community is now open to you.' else 'The Host could not approve your request.'||case when reason is not null then ' '||reason else ' Contact support if you need help.' end end,
    case when new.status='active' then '/communities/'||community_slug else '/communities' end,
    'community-join-decision:'||new.id||':'||new.status||':'||pg_catalog.txid_current());
  return new;
end; $$;
revoke all on function public.notify_community_membership_decision() from public,anon,authenticated;

create function public.notify_community_host_of_join() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.communities%rowtype; host record; member_name text;
begin
  if new.status not in ('active','requested') then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  select * into c from public.communities where id=new.community_id;
  select coalesce(nullif(display_name,''),'A member') into member_name from public.profiles where id=new.user_id;
  for host in select m.user_id from public.community_memberships m join public.profiles p on p.id=m.user_id where m.community_id=c.id and m.status='active' and m.role in ('owner','moderator') and p.access_status='active' and m.user_id<>new.user_id loop
    perform public.enqueue_notification(host.user_id,'community',case when new.status='active' then 'A member joined '||c.name else 'New request to join '||c.name end,
      member_name||case when new.status='active' then ' has joined your Community.' else ' would like to join. Review the request in your Community controls.' end,
      '/communities/'||c.slug||'/host#admissions','community-join-'||new.status||':'||c.id||':'||new.user_id);
  end loop;
  return new;
end; $$;
revoke all on function public.notify_community_host_of_join() from public,anon,authenticated;
create trigger community_host_join_notification after insert or update of status on public.community_memberships for each row execute function public.notify_community_host_of_join();

do $$ declare signature text; begin foreach signature in array array['list_community_join_limits(uuid)','save_community_join_limit(uuid,integer,boolean)','join_community_with_capacity(uuid)','leave_community_waitlist(uuid)','list_community_waiting_members(uuid)','review_community_waiting_member(uuid,uuid,text,text)','review_community_join_request(uuid,text,text)','save_community_host_application_with_limits(uuid,text,text,text,text,integer,text,text,text,text,boolean,text,text,integer,boolean)']
loop execute 'revoke all on function public.'||signature||' from public,anon';execute 'grant execute on function public.'||signature||' to authenticated';end loop;end $$;
notify pgrst,'reload schema';
commit;
