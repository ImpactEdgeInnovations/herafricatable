begin;

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  enabled boolean not null default false,
  description text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags(key,enabled,description)
values('communities',false,'Private and official member communities')
on conflict(key)do nothing;

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check(char_length(name)between 3 and 80),
  description text not null check(char_length(description)between 20 and 1200),
  community_type text not null default'official'check(community_type in('official','private')),
  status text not null default'draft'check(status in('draft','published','archived')),
  created_by uuid not null references auth.users(id)on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_memberships (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id)on delete cascade,
  user_id uuid not null references auth.users(id)on delete cascade,
  role text not null default'member'check(role in('owner','moderator','member')),
  status text not null check(status in('requested','invited','active','declined','removed')),
  invited_by uuid references auth.users(id)on delete set null,
  reviewed_by uuid references auth.users(id)on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(community_id,user_id)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id)on delete cascade,
  author_id uuid not null references auth.users(id)on delete cascade,
  body text not null check(char_length(body)between 2 and 3000),
  status text not null default'published'check(status in('published','hidden','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id)on delete cascade,
  reporter_id uuid not null references auth.users(id)on delete cascade,
  category text not null check(category in('harassment','privacy','spam','misinformation','safety','other')),
  details text not null check(char_length(details)between 10 and 2000),
  evidence_snapshot jsonb not null,
  status text not null default'open'check(status in('open','reviewing','resolved','dismissed')),
  assigned_to uuid references auth.users(id)on delete set null,
  outcome text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index community_memberships_user_idx on public.community_memberships(user_id,status,updated_at desc);
create index community_memberships_review_idx on public.community_memberships(community_id,status,created_at);
create unique index community_one_active_owner_idx on public.community_memberships(community_id)where status='active'and role='owner';
create index community_posts_feed_idx on public.community_posts(community_id,status,created_at desc);
create unique index community_reports_active_idx on public.community_post_reports(post_id,reporter_id)where status in('open','reviewing');
create index community_reports_queue_idx on public.community_post_reports(status,created_at);

alter table public.feature_flags enable row level security;
alter table public.communities enable row level security;
alter table public.community_memberships enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_post_reports enable row level security;

create or replace function public.communities_enabled()
returns boolean language sql stable security definer set search_path=''as $$select coalesce((select enabled from public.feature_flags where key='communities'),false)$$;

create or replace function public.can_manage_community(p_community_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=''as $$select public.is_admin(array['super_admin']::public.app_role[])or exists(select 1 from public.community_memberships where community_id=p_community_id and user_id=p_user_id and status='active'and role in('owner','moderator'))$$;

create policy "Authenticated users read feature flags"on public.feature_flags for select to authenticated using(true);
create policy "Members read available communities"on public.communities for select to authenticated using(
  (public.communities_enabled()or public.is_admin(array['super_admin']::public.app_role[]))and public.is_active_member(auth.uid())and(
    status='published'or created_by=auth.uid()or exists(select 1 from public.community_memberships m where m.community_id=id and m.user_id=auth.uid())
  )
);
create policy "Members read own community memberships"on public.community_memberships for select to authenticated using(
  (public.communities_enabled()or public.is_admin(array['super_admin']::public.app_role[]))and(user_id=auth.uid()or public.can_manage_community(community_id))
);
create policy "Active community members read posts"on public.community_posts for select to authenticated using(
  public.communities_enabled()and exists(select 1 from public.community_memberships m where m.community_id=community_posts.community_id and m.user_id=auth.uid()and m.status='active')
);
create policy "Members read own community reports"on public.community_post_reports for select to authenticated using(reporter_id=auth.uid());

create or replace function public.set_feature_flag(p_key text,p_enabled boolean)
returns void language plpgsql security definer set search_path=''as $$begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 update public.feature_flags set enabled=p_enabled,updated_by=auth.uid(),updated_at=now()where key=p_key;
 if not found then raise exception'Feature flag not found';end if;
 insert into public.audit_events(actor_id,action,target_type,metadata)values(auth.uid(),'platform.feature_flag_changed','feature_flag',jsonb_build_object('key',p_key,'enabled',p_enabled));
end;$$;

create or replace function public.save_community(p_community_id uuid,p_name text,p_slug text,p_description text,p_type text,p_status text)
returns uuid language plpgsql security definer set search_path=''as $$declare actor uuid:=auth.uid();saved uuid:=p_community_id;clean_slug text:=lower(trim(p_slug));begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 if char_length(trim(coalesce(p_name,'')))not between 3 and 80 or char_length(trim(coalesce(p_description,'')))not between 20 and 1200 then raise exception'Name and description are required';end if;
 if clean_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$'then raise exception'Use a lowercase URL slug';end if;
 if p_type not in('official','private')or p_status not in('draft','published','archived')then raise exception'Unsupported community settings';end if;
 if p_community_id is null then
  insert into public.communities(name,slug,description,community_type,status,created_by)values(trim(p_name),clean_slug,trim(p_description),p_type,p_status,actor)returning id into saved;
  insert into public.community_memberships(community_id,user_id,role,status,invited_by,reviewed_by,joined_at)values(saved,actor,'owner','active',actor,actor,now());
 else
  update public.communities set name=trim(p_name),slug=clean_slug,description=trim(p_description),community_type=p_type,status=p_status,updated_at=now()where id=p_community_id;
  if not found then raise exception'Community not found';end if;
 end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,case when p_community_id is null then'community.created'else'community.updated'end,'community',saved,jsonb_build_object('status',p_status,'type',p_type));return saved;
end;$$;

create or replace function public.list_communities()
returns table(community_id uuid,slug text,name text,description text,community_type text,status text,membership_status text,membership_role text,member_count bigint,pending_count bigint)
language plpgsql stable security definer set search_path=''as $$begin
 if not public.is_active_member(auth.uid())then raise exception'Active membership required';end if;
 if not public.communities_enabled()and not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Communities are not available yet';end if;
 return query select c.id,c.slug,c.name,c.description,c.community_type,c.status,m.status,m.role,(select count(*)from public.community_memberships cm where cm.community_id=c.id and cm.status='active'),(select count(*)from public.community_memberships cm where cm.community_id=c.id and cm.status in('requested','invited'))from public.communities c left join public.community_memberships m on m.community_id=c.id and m.user_id=auth.uid()where c.status='published'or m.user_id=auth.uid()or public.is_admin(array['super_admin']::public.app_role[])order by case when m.status='active'then 0 else 1 end,c.name;
end;$$;

create or replace function public.request_community_access(p_community_id uuid)
returns void language plpgsql security definer set search_path=''as $$declare actor uuid:=auth.uid();target public.communities%rowtype;next_status text;begin
 if not public.communities_enabled()or not public.is_active_member(actor)then raise exception'Communities are unavailable';end if;
 select*into target from public.communities where id=p_community_id and status='published';if not found then raise exception'Community not found';end if;
 next_status:=case when target.community_type='official'then'active'else'requested'end;
 insert into public.community_memberships(community_id,user_id,role,status,joined_at)values(p_community_id,actor,'member',next_status,case when next_status='active'then now()end)
 on conflict(community_id,user_id)do update set status=excluded.status,joined_at=excluded.joined_at,updated_at=now()where community_memberships.status in('declined','removed');
 if not found then raise exception'Membership already exists';end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'community.membership_'||next_status,'community',p_community_id,jsonb_build_object('status',next_status));
end;$$;

create or replace function public.respond_to_community_invitation(p_community_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=''as $$begin
 if not public.communities_enabled()then raise exception'Communities are unavailable';end if;
 update public.community_memberships set status=case when p_accept then'active'else'declined'end,joined_at=case when p_accept then now()else null end,updated_at=now()where community_id=p_community_id and user_id=auth.uid()and status='invited';
 if not found then raise exception'Invitation not found';end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'community.invitation_responded','community',p_community_id,jsonb_build_object('accepted',p_accept));
end;$$;

create or replace function public.invite_community_member(p_community_id uuid,p_email text,p_role text default'member')
returns uuid language plpgsql security definer set search_path=''as $$declare target_user uuid;saved uuid;begin
 if not public.can_manage_community(p_community_id)then raise exception'Not authorized';end if;
 if p_role not in('member','moderator')then raise exception'Unsupported community role';end if;
 select u.id into target_user from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=lower(trim(p_email))and p.access_status='active';
 if target_user is null then raise exception'Active member not found';end if;
 insert into public.community_memberships(community_id,user_id,role,status,invited_by)values(p_community_id,target_user,p_role,'invited',auth.uid())
 on conflict(community_id,user_id)do update set role=excluded.role,status='invited',invited_by=auth.uid(),updated_at=now()where community_memberships.status in('declined','removed')returning id into saved;
 if saved is null then raise exception'Membership already exists';end if;
 perform public.enqueue_notification(target_user,'network','Community invitation','You have been invited to join a Her Africa Table community.','/communities','community-invitation:'||saved);
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'community.member_invited','community_membership',saved,jsonb_build_object('community_id',p_community_id,'role',p_role));return saved;
end;$$;

create or replace function public.review_community_membership(p_membership_id uuid,p_action text)
returns void language plpgsql security definer set search_path=''as $$declare target public.community_memberships%rowtype;begin
 if p_action not in('approve','decline','remove','promote','demote','transfer_ownership')then raise exception'Unsupported membership action';end if;
 select*into target from public.community_memberships where id=p_membership_id for update;
 if not found or not public.can_manage_community(target.community_id)then raise exception'Not authorized';end if;
 if target.role='owner'and p_action in('remove','demote')then raise exception'The community owner cannot be removed';end if;
 if p_action='transfer_ownership'then
  if not public.is_admin(array['super_admin']::public.app_role[])or target.status<>'active'or target.role='owner'then raise exception'Super admin and an active successor are required';end if;
  update public.community_memberships set role='member',updated_at=now()where community_id=target.community_id and status='active'and role='owner';
  update public.community_memberships set role='owner',reviewed_by=auth.uid(),updated_at=now()where id=p_membership_id;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'community.ownership_transferred','community_membership',p_membership_id,jsonb_build_object('community_id',target.community_id,'member_id',target.user_id));return;
 end if;
 update public.community_memberships set status=case when p_action='approve'then'active'when p_action='decline'then'declined'when p_action='remove'then'removed'else status end,role=case when p_action='promote'then'moderator'when p_action='demote'then'member'else role end,reviewed_by=auth.uid(),joined_at=case when p_action='approve'then now()else joined_at end,updated_at=now()where id=p_membership_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'community.membership_'||p_action,'community_membership',p_membership_id,jsonb_build_object('community_id',target.community_id,'member_id',target.user_id));
end;$$;

create or replace function public.list_community_members(p_community_id uuid)
returns table(membership_id uuid,user_id uuid,display_name text,job_title text,company text,role text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path=''as $$begin
 if not public.can_manage_community(p_community_id)then raise exception'Not authorized';end if;
 return query select m.id,m.user_id,p.display_name,p.job_title,p.company,m.role,m.status,m.created_at from public.community_memberships m join public.profiles p on p.id=m.user_id where m.community_id=p_community_id order by case m.status when'requested'then 0 when'invited' then 1 when'active'then 2 else 3 end,m.created_at;
end;$$;

create or replace function public.list_community_posts(p_community_id uuid,p_limit integer default 30,p_offset integer default 0)
returns table(post_id uuid,author_id uuid,author_name text,author_role text,author_company text,body text,created_at timestamptz)
language plpgsql stable security definer set search_path=''as $$begin
 if not public.communities_enabled()or not exists(select 1 from public.community_memberships where community_id=p_community_id and user_id=auth.uid()and status='active')then raise exception'Active community membership required';end if;
 return query select cp.id,cp.author_id,p.display_name,p.job_title,p.company,cp.body,cp.created_at from public.community_posts cp join public.profiles p on p.id=cp.author_id where cp.community_id=p_community_id and cp.status='published'and public.is_active_member(cp.author_id)and not public.is_blocked_pair(auth.uid(),cp.author_id)order by cp.created_at desc limit least(greatest(coalesce(p_limit,30),1),50)offset greatest(coalesce(p_offset,0),0);
end;$$;

create or replace function public.create_community_post(p_community_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=''as $$declare actor uuid:=auth.uid();saved uuid;begin
 if not public.communities_enabled()or not public.is_active_member(actor)or not exists(select 1 from public.community_memberships where community_id=p_community_id and user_id=actor and status='active')then raise exception'Active community membership required';end if;
 if char_length(trim(coalesce(p_body,'')))not between 2 and 3000 then raise exception'Post must be between 2 and 3000 characters';end if;
 if(select count(*)from public.community_posts where author_id=actor and created_at>now()-interval'1 hour')>=10 then raise exception'Hourly community post limit reached';end if;
 insert into public.community_posts(community_id,author_id,body)values(p_community_id,actor,trim(p_body))returning id into saved;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'community.post_created','community_post',saved,jsonb_build_object('community_id',p_community_id));return saved;
end;$$;

create or replace function public.delete_community_post(p_post_id uuid)
returns void language plpgsql security definer set search_path=''as $$declare target public.community_posts%rowtype;begin
 select*into target from public.community_posts where id=p_post_id for update;
 if not found or(not public.communities_enabled()and not public.can_manage_community(target.community_id))or(target.author_id<>auth.uid()and not public.can_manage_community(target.community_id))then raise exception'Post not found';end if;
 update public.community_posts set status='deleted',body='[Removed by author]',updated_at=now()where id=p_post_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'community.post_deleted','community_post',p_post_id,jsonb_build_object('community_id',target.community_id));
end;$$;

create or replace function public.report_community_post(p_post_id uuid,p_category text,p_details text)
returns uuid language plpgsql security definer set search_path=''as $$declare actor uuid:=auth.uid();target public.community_posts%rowtype;saved uuid;begin
 if not public.communities_enabled()or not public.is_active_member(actor)then raise exception'Communities are unavailable';end if;
 select*into target from public.community_posts where id=p_post_id and status='published'and author_id<>actor;
 if not found or not exists(select 1 from public.community_memberships where community_id=target.community_id and user_id=actor and status='active')then raise exception'Post unavailable';end if;
 if p_category not in('harassment','privacy','spam','misinformation','safety','other')or char_length(trim(coalesce(p_details,'')))not between 10 and 2000 then raise exception'Valid report details are required';end if;
 insert into public.community_post_reports(post_id,reporter_id,category,details,evidence_snapshot)values(p_post_id,actor,p_category,trim(p_details),jsonb_build_object('post_id',target.id,'community_id',target.community_id,'author_id',target.author_id,'body',target.body,'captured_at',now()))returning id into saved;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'community.post_reported','community_post_report',saved,jsonb_build_object('post_id',p_post_id));return saved;
exception when unique_violation then raise exception'You already have an active report for this post';end;$$;

create or replace function public.list_community_reports()
returns table(report_id uuid,community_id uuid,community_name text,reporter_email text,category text,details text,evidence_snapshot jsonb,status text,created_at timestamptz)
language plpgsql security definer set search_path=''as $$begin
 if not public.is_admin(array['super_admin','moderator']::public.app_role[])then raise exception'Moderator role required';end if;
 insert into public.audit_events(actor_id,action,target_type,metadata)values(auth.uid(),'community.report_queue_accessed','community_reports',jsonb_build_object('accessed_at',now()));
 return query select r.id,p.community_id,c.name,u.email::text,r.category,r.details,r.evidence_snapshot,r.status,r.created_at from public.community_post_reports r join public.community_posts p on p.id=r.post_id join public.communities c on c.id=p.community_id join auth.users u on u.id=r.reporter_id order by case r.status when'open'then 0 when'reviewing'then 1 else 2 end,r.created_at;
end;$$;

create or replace function public.review_community_report(p_report_id uuid,p_action text,p_outcome text)
returns void language plpgsql security definer set search_path=''as $$declare target public.community_post_reports%rowtype;begin
 if not public.is_admin(array['super_admin','moderator']::public.app_role[])then raise exception'Moderator role required';end if;
 if p_action not in('start_review','hide','dismiss')or(p_action<>'start_review'and char_length(trim(coalesce(p_outcome,'')))<5)then raise exception'Valid moderation action and outcome required';end if;
 select*into target from public.community_post_reports where id=p_report_id for update;if not found or target.status not in('open','reviewing')then raise exception'Active report not found';end if;
 update public.community_post_reports set status=case p_action when'start_review'then'reviewing'when'hide'then'resolved'else'dismissed'end,assigned_to=auth.uid(),outcome=nullif(trim(p_outcome),''),reviewed_at=case when p_action='start_review'then null else now()end,updated_at=now()where id=p_report_id;
 if p_action='hide'then update public.community_posts set status='hidden',updated_at=now()where id=target.post_id;end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'community.report_'||p_action,'community_post_report',p_report_id,jsonb_build_object('post_id',target.post_id,'outcome',nullif(trim(p_outcome),'')));
end;$$;

revoke all on function public.communities_enabled()from public;grant execute on function public.communities_enabled()to authenticated;
revoke all on function public.can_manage_community(uuid,uuid)from public;grant execute on function public.can_manage_community(uuid,uuid)to authenticated;
revoke all on function public.set_feature_flag(text,boolean)from public;grant execute on function public.set_feature_flag(text,boolean)to authenticated;
revoke all on function public.save_community(uuid,text,text,text,text,text)from public;grant execute on function public.save_community(uuid,text,text,text,text,text)to authenticated;
revoke all on function public.list_communities()from public;grant execute on function public.list_communities()to authenticated;
revoke all on function public.request_community_access(uuid)from public;grant execute on function public.request_community_access(uuid)to authenticated;
revoke all on function public.respond_to_community_invitation(uuid,boolean)from public;grant execute on function public.respond_to_community_invitation(uuid,boolean)to authenticated;
revoke all on function public.invite_community_member(uuid,text,text)from public;grant execute on function public.invite_community_member(uuid,text,text)to authenticated;
revoke all on function public.review_community_membership(uuid,text)from public;grant execute on function public.review_community_membership(uuid,text)to authenticated;
revoke all on function public.list_community_members(uuid)from public;grant execute on function public.list_community_members(uuid)to authenticated;
revoke all on function public.list_community_posts(uuid,integer,integer)from public;grant execute on function public.list_community_posts(uuid,integer,integer)to authenticated;
revoke all on function public.create_community_post(uuid,text)from public;grant execute on function public.create_community_post(uuid,text)to authenticated;
revoke all on function public.delete_community_post(uuid)from public;grant execute on function public.delete_community_post(uuid)to authenticated;
revoke all on function public.report_community_post(uuid,text,text)from public;grant execute on function public.report_community_post(uuid,text,text)to authenticated;
revoke all on function public.list_community_reports()from public;grant execute on function public.list_community_reports()to authenticated;
revoke all on function public.review_community_report(uuid,text,text)from public;grant execute on function public.review_community_report(uuid,text,text)to authenticated;

do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime')and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'and schemaname='public'and tablename='community_posts')then alter publication supabase_realtime add table public.community_posts;end if;end$$;

comment on table public.feature_flags is'Operational release gates changed only by audited Super Admin operations.';
comment on table public.community_post_reports is'Report-scoped community moderation evidence; general private feed access is not granted to platform moderators.';
commit;
