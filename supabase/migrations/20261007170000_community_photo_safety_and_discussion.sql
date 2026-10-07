begin;
alter table public.community_album_photos add column admin_hidden boolean not null default false,
 add column pre_admin_status text check(pre_admin_status in ('published','pending','hidden'));
create table public.community_photo_reports (
 id uuid primary key default gen_random_uuid(),
 photo_id uuid references public.community_album_photos(id) on delete set null,
 community_id uuid references public.communities(id) on delete set null,
 reporter_id uuid references public.profiles(id) on delete set null,
 category text not null check(category in ('privacy','harassment','safety','spam','other')),
 details text not null check(char_length(details) between 10 and 2000),
 evidence_snapshot jsonb not null,
 status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
 assigned_to uuid references public.profiles(id) on delete set null,
 outcome text, blocks_photo boolean not null default false, created_at timestamptz not null default now(), reviewed_at timestamptz
);
alter table public.community_photo_reports enable row level security;
revoke all on public.community_photo_reports from public,anon,authenticated;
grant all on public.community_photo_reports to service_role;
create unique index community_photo_reports_open_idx on public.community_photo_reports(photo_id,reporter_id) where status in ('open','reviewing');
create index community_photo_reports_reporter_idx on public.community_photo_reports(reporter_id,created_at desc);
create index community_photo_reports_community_idx on public.community_photo_reports(community_id);
create index community_photo_reports_assigned_idx on public.community_photo_reports(assigned_to);
create index community_photo_reports_queue_idx on public.community_photo_reports(status,created_at desc,id);

create function public.report_community_photo(p_photo_id uuid,p_category text,p_details text)
returns uuid language plpgsql security definer set search_path='' as $$
declare photo public.community_album_photos; album public.community_photo_albums; cid uuid; saved uuid;
begin
 -- Includes ownership-independent access: a Host can report a member's photo.
 perform public.get_community_photo_file(p_photo_id);
 if p_category is null or p_category not in ('privacy','harassment','safety','spam','other')
  or char_length(btrim(coalesce(p_details,''))) not between 10 and 2000 then raise exception 'Choose a reason and explain what happened'; end if;
 select community_id into cid from public.community_album_photos where id=p_photo_id;
 perform 1 from public.communities where id=cid for update;
 perform pg_advisory_xact_lock(hashtextextended('community.photo.report:'||auth.uid()::text,0));
 select * into photo from public.community_album_photos where id=p_photo_id for update;
 perform public.get_community_photo_file(p_photo_id);
 select id into saved from public.community_photo_reports where photo_id=p_photo_id and reporter_id=auth.uid() and status in ('open','reviewing');
 if found then return saved; end if;
 if (select count(*) from public.community_photo_reports where reporter_id=auth.uid() and created_at>now()-interval '1 day')>=5 then raise exception 'You have sent five photo reports today. Contact the safety team if you need urgent help'; end if;
 select * into album from public.community_photo_albums where id=photo.album_id;
 insert into public.community_photo_reports(photo_id,community_id,reporter_id,category,details,evidence_snapshot)
 values(photo.id,cid,auth.uid(),p_category,btrim(p_details),jsonb_build_object('photo_id',photo.id,'album_id',album.id,
  'album_title',album.title,'caption',photo.caption,'uploader_id',photo.uploader_id,'created_at',photo.created_at,
  'post_id',album.post_id,'room_id',album.room_id,'status',photo.status)) returning id into saved;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
 values(auth.uid(),'community.photo_reported','community_photo_report',saved,jsonb_build_object('photo_id',photo.id,'category',p_category));
 return saved;
end;
$$;
create function public.list_community_photo_reports()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_admin(array['super_admin','moderator']::public.app_role[]) then raise exception 'Moderator role required'; end if;
 select coalesce(jsonb_agg(to_jsonb(item) order by (item.status in ('open','reviewing')) desc,item.created_at desc,item.report_id),'[]') into result from (
  select r.id report_id,r.photo_id,r.community_id,coalesce(c.name,'Community') community_name,
    coalesce(p.email,'Former member') reporter_email,r.category,r.details,r.evidence_snapshot,r.status,r.created_at,r.blocks_photo,'photo'::text content_type
  from public.community_photo_reports r left join public.communities c on c.id=r.community_id left join auth.users p on p.id=r.reporter_id
  order by (r.status in ('open','reviewing')) desc,r.created_at desc,r.id limit 100
 ) item;
 return result;
end;
$$;
create function public.review_community_photo_report(p_report_id uuid,p_action text,p_outcome text)
returns void language plpgsql security definer set search_path='' as $$
declare target public.community_photo_reports; cid uuid;
begin
 if auth.uid() is null or not public.is_admin(array['super_admin','moderator']::public.app_role[]) then raise exception 'Moderator role required'; end if;
 if p_action is null or p_action not in ('start_review','hide','dismiss','restore') or (p_action<>'start_review' and char_length(btrim(coalesce(p_outcome,''))) not between 5 and 1000) then raise exception 'Add a decision and a short reason'; end if;
 select community_id into cid from public.community_photo_reports where id=p_report_id;
 perform 1 from public.communities where id=cid for update;
 select * into target from public.community_photo_reports where id=p_report_id for update;
 if not found or (p_action='restore' and not target.blocks_photo) or (p_action<>'restore' and target.status not in ('open','reviewing')) then raise exception 'Active report not found'; end if;
 if p_action='hide' then
  update public.community_album_photos set pre_admin_status=case when admin_hidden then pre_admin_status else status end,
   status='hidden',admin_hidden=true,removed_at=null where id=target.photo_id and status in ('published','pending','hidden');
 end if;
 update public.community_photo_reports set status=case p_action when 'start_review' then 'reviewing' when 'hide' then 'resolved' when 'restore' then 'resolved' else 'dismissed' end,
 blocks_photo=case when p_action='hide' then true when p_action='restore' then false else blocks_photo end,
 assigned_to=auth.uid(),outcome=nullif(btrim(p_outcome),''),reviewed_at=case when p_action='start_review' then null else now() end where id=p_report_id;
 if p_action='restore' and not exists(select 1 from public.community_photo_reports where photo_id=target.photo_id and blocks_photo) then
  update public.community_album_photos set admin_hidden=false,status=case when status='hidden' then coalesce(pre_admin_status,'hidden') else status end,
   pre_admin_status=null where id=target.photo_id;
 end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
 values(auth.uid(),'community.photo_report_'||p_action,'community_photo_report',p_report_id,jsonb_build_object('photo_id',target.photo_id,'outcome',nullif(btrim(p_outcome),'')));
end;
$$;
create function public.get_community_reported_photo_file(p_report_id uuid,p_photo_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare path text;
begin
 if auth.uid() is null or not public.is_admin(array['super_admin','moderator']::public.app_role[]) then raise exception 'Moderator role required'; end if;
 -- Review only this report's binary, not its album or Community feed.
 select p.community_id::text||'/'||p.id::text into path
 from public.community_photo_reports r join public.community_album_photos p on p.id=r.photo_id
 where r.id=p_report_id and r.photo_id=p_photo_id and (r.status in ('open','reviewing') or r.blocks_photo)
 and r.created_at>now()-interval '30 days' and p.status in ('published','pending','hidden','removed','rejected')
 and not exists(select 1 from public.profiles where id=p.uploader_id and access_status='deleted');
 if path is null then raise exception 'Reported photo unavailable'; end if;
 return path;
end;
$$;

create or replace function public.review_community_album_photo(p_photo_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare photo public.community_album_photos; cid uuid; host boolean; changed text;
begin
 select community_id into cid from public.community_album_photos where id=p_photo_id;
 if cid is null or not public.can_access_community_photos(cid,true) then raise exception 'Active Community membership required'; end if;
 perform 1 from public.communities where id=cid for update;
 select * into photo from public.community_album_photos where id=p_photo_id for update;
 host:=public.can_manage_community(cid);
 if p_action='restore' and photo.admin_hidden then raise exception 'The safety team must release this photo first'; end if;
 if p_action='remove' and (host or photo.uploader_id=auth.uid()) and photo.status in ('pending','published','hidden','rejected') then changed:='removed';
 elsif host and p_action='approve' and photo.status='pending' and not photo.admin_hidden then changed:='published';
 elsif host and p_action='reject' and photo.status='pending' then changed:='rejected';
 elsif host and p_action='hide' and photo.status='published' then changed:='hidden';
 elsif host and p_action='restore' and photo.status in ('hidden','removed') and (photo.removed_at is null or photo.removed_at>now()-interval '7 days') then changed:='published';
 else raise exception 'This photo cannot be changed that way'; end if;
 update public.community_album_photos set status=changed,removed_at=case when changed in ('removed','rejected') then now() else null end where id=p_photo_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'community.photo_'||p_action,'community_album_photo',p_photo_id,jsonb_build_object('previous_status',photo.status));
end;
$$;
create or replace function public.claim_community_photo_cleanup(p_uploader_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare photo public.community_album_photos; output jsonb:='[]';
begin
 for photo in select p.* from public.community_album_photos p left join public.profiles prof on prof.id=p.uploader_id
 where (p_uploader_id is null or p.uploader_id=p_uploader_id) and (
  prof.access_status='deleted' or (
   ((p.status='reserved' and p.reservation_expires_at<now()) or (p.status='uploading' and p.upload_started_at<now()-interval '10 minutes')
    or (p.status in ('removed','rejected') and p.removed_at<now()-interval '7 days') or p.status='cleaning')
   and not exists(select 1 from public.community_photo_reports r where r.photo_id=p.id and r.status in ('open','reviewing') and r.created_at>now()-interval '30 days')
  )) order by p.created_at limit 10 for update of p skip locked
 loop
  update public.community_album_photos set status='cleaning',upload_token=null where id=photo.id;
  output:=output||jsonb_build_array(jsonb_build_object('id',photo.id,'path',photo.community_id::text||'/'||photo.id::text));
 end loop;
 return output;
end;
$$;

create function public.get_community_album_discussion(p_album_id uuid,p_before uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare album public.community_photo_albums; parent public.community_posts; cursor_time timestamptz; replies jsonb; more boolean;
begin
 select * into album from public.community_photo_albums where id=p_album_id and status='active';
 if not found or not public.can_access_community_photos(album.community_id) then raise exception 'Active Community membership required'; end if;
 select * into parent from public.community_posts where id=album.post_id;
 if not found or parent.status<>'published' or public.is_blocked_pair(auth.uid(),parent.author_id) or not public.is_active_member(parent.author_id) then return jsonb_build_object('unavailable',true); end if;
 if p_before is not null then
  select created_at into cursor_time from public.community_posts where id=p_before and parent_post_id=parent.id and status='published';
  if not found then raise exception 'Reply cursor not found'; end if;
 end if;
 with page as (
  select reply.id,reply.author_id,profile.display_name author_name,reply.body,reply.created_at
  from public.community_posts reply join public.profiles profile on profile.id=reply.author_id
  where reply.parent_post_id=parent.id and reply.status='published' and profile.access_status='active'
   and not public.is_blocked_pair(auth.uid(),reply.author_id)
   and (p_before is null or (reply.created_at,reply.id)<(cursor_time,p_before))
  order by reply.created_at desc,reply.id desc limit 51
 ), numbered as (select *,row_number() over(order by created_at desc,id desc) n from page)
 select coalesce(jsonb_agg(jsonb_build_object('comment_id',id,'author_id',author_id,'author_name',author_name,'body',body,'created_at',created_at)
 order by created_at,id) filter(where n<=50),'[]'::jsonb),count(*)>50 into replies,more from numbered;
 return jsonb_build_object('post_id',parent.id,'comments',replies,'has_more',more,'read_only',not public.can_access_community_photos(album.community_id,true));
end;
$$;
create function public.reply_to_community_album(p_album_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare discussion jsonb; cid uuid;
begin
 select community_id into cid from public.community_photo_albums where id=p_album_id;
 perform 1 from public.communities where id=cid for update;
 discussion:=public.get_community_album_discussion(p_album_id);
 if coalesce((discussion->>'unavailable')::boolean,false) then raise exception 'This conversation is no longer available'; end if;
 if (discussion->>'read_only')::boolean then raise exception 'This Community is read only'; end if;
 return public.create_community_comment((discussion->>'post_id')::uuid,p_body);
end;
$$;
revoke all on function public.report_community_photo(uuid,text,text),public.list_community_photo_reports(),
 public.review_community_photo_report(uuid,text,text),public.get_community_reported_photo_file(uuid,uuid),
 public.get_community_album_discussion(uuid,uuid),public.reply_to_community_album(uuid,text) from public,anon;
grant execute on function public.report_community_photo(uuid,text,text),public.list_community_photo_reports(),
 public.review_community_photo_report(uuid,text,text),public.get_community_reported_photo_file(uuid,uuid),
 public.get_community_album_discussion(uuid,uuid),public.reply_to_community_album(uuid,text) to authenticated;
commit;
