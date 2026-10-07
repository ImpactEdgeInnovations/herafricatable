begin;
alter table public.community_album_photos drop constraint community_album_photos_status_check;
alter table public.community_album_photos add constraint community_album_photos_status_check
 check(status in ('reserved','uploading','cleaning','pending','published','hidden','rejected','removed'));
alter table public.community_album_photos add column upload_token uuid,
 add column upload_started_at timestamptz, add column width integer, add column height integer,
 add column upload_attempts integer not null default 0;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('community-photos','community-photos',false,1048576,array['image/webp']);
-- Restrictive policies also defeat any legacy permissive policy for another bucket.
create policy community_photos_server_only on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'community-photos') with check(bucket_id<>'community-photos');

create function public.community_photo_actor_can_upload(p_photo_id uuid,p_actor uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select p_actor is not null and public.is_active_member(p_actor) and public.communities_enabled()
  and exists(select 1 from public.community_album_photos p
   join public.community_photo_albums a on a.id=p.album_id
   join public.communities c on c.id=a.community_id
   join public.community_photo_settings s on s.community_id=c.id
   where p.id=p_photo_id and p.uploader_id=p_actor and a.status='active' and not a.is_closed and c.status='published' and s.uploads_enabled
    and exists(select 1 from public.community_memberships m where m.community_id=c.id and m.user_id=p_actor and m.status='active'
      and (a.contribution_mode<>'hosts_only' or m.role in ('owner','moderator')))
    and not exists(select 1 from public.community_cohorts cohort where cohort.community_id=c.id
      and (cohort.status<>'active' or cohort.follow_up_until<=now())));
$$;
create function public.claim_community_photo_upload(p_photo_id uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare photo public.community_album_photos; cid uuid; token uuid:=gen_random_uuid();
begin
 select community_id into cid from public.community_album_photos where id=p_photo_id;
 if cid is null then raise exception 'Start a new photo upload'; end if;
 perform 1 from public.communities where id=cid for update;
 select * into photo from public.community_album_photos where id=p_photo_id for update;
 if not public.community_photo_actor_can_upload(p_photo_id,p_actor) then raise exception 'This album is not accepting your photos'; end if;
 if photo.status in ('pending','published') then return jsonb_build_object('status',photo.status); end if;
 if photo.upload_attempts>=5 then raise exception 'This photo has reached its retry limit. Choose your photos again'; end if;
 if photo.status<>'reserved' or photo.reservation_expires_at<=now() then raise exception 'This photo upload is busy or has expired. Start a new upload'; end if;
 update public.community_album_photos set status='uploading',upload_token=token,upload_started_at=now(),upload_attempts=upload_attempts+1 where id=p_photo_id;
 return jsonb_build_object('status','uploading','token',token,'path',cid::text||'/'||photo.id::text);
end;
$$;
create function public.finish_community_photo_upload(p_photo_id uuid,p_actor uuid,p_token uuid,p_bytes integer,p_width integer,p_height integer,p_caption text)
returns text language plpgsql security invoker set search_path='' as $$
declare photo public.community_album_photos; cid uuid; next_status text; host boolean;
begin
 select community_id into cid from public.community_album_photos where id=p_photo_id;
 perform 1 from public.communities where id=cid for update;
 select * into photo from public.community_album_photos where id=p_photo_id for update;
 if not found or photo.status<>'uploading' or photo.upload_token is distinct from p_token or p_token is null
  or not public.community_photo_actor_can_upload(p_photo_id,p_actor) then raise exception 'This photo can no longer be saved'; end if;
 if p_bytes is null or p_bytes not between 1 and 1114112 or p_width is null or p_height is null
  or p_width not between 1 and 1920 or p_height not between 1 and 1920 or char_length(coalesce(p_caption,''))>500 then raise exception 'Invalid processed photo'; end if;
 host:=exists(select 1 from public.community_memberships where community_id=cid and user_id=p_actor and status='active' and role in ('owner','moderator'));
 select case when contribution_mode='review' and not host then 'pending' else 'published' end into next_status from public.community_photo_albums where id=photo.album_id;
 update public.community_album_photos set status=next_status,stored_bytes=p_bytes,width=p_width,height=p_height,caption=btrim(coalesce(p_caption,'')),upload_token=null,upload_started_at=null where id=p_photo_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values(p_actor,'community.photo_uploaded','community_album_photo',p_photo_id,jsonb_build_object('album_id',photo.album_id,'status',next_status,'stored_bytes',p_bytes));
 return next_status;
end;
$$;
create function public.reset_community_photo_upload(p_photo_id uuid,p_token uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 -- Called only after the trusted worker has removed both binaries successfully.
 update public.community_album_photos set status='reserved',upload_token=null,upload_started_at=null
  where id=p_photo_id and status='uploading' and upload_token=p_token;
end;
$$;

create function public.list_community_photo_albums(p_community_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; budget bigint; used bigint; enabled boolean;
begin
 if not public.can_access_community_photos(p_community_id) then raise exception 'Active Community membership required'; end if;
 select allowance_bytes,uploads_enabled into budget,enabled from public.community_photo_settings where community_id=p_community_id;
 select coalesce(sum(coalesce(stored_bytes,reserved_bytes)),0) into used from public.community_album_photos where community_id=p_community_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'description',a.description,'created_at',a.created_at,
  'contribution_mode',a.contribution_mode,'is_closed',a.is_closed,'room_id',a.room_id,'post_id',a.post_id,
  'gathering_title',e.title,'gathering_slug',e.slug,
  'photo_count',(select count(*) from public.community_album_photos p where p.album_id=a.id and p.status='published')) order by a.created_at desc,a.id),'[]'::jsonb)
 into result from public.community_photo_albums a left join public.community_gathering_rooms r on r.id=a.room_id
 left join public.events e on e.id=r.event_id where a.community_id=p_community_id and a.status='active';
 return jsonb_build_object('albums',result,'allowance_bytes',coalesce(budget,524288000),'used_bytes',used,'uploads_enabled',coalesce(enabled,false),'can_manage',public.can_manage_community(p_community_id));
end;
$$;
create function public.get_community_photo_album(p_album_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare album public.community_photo_albums; host boolean; photos jsonb;
begin
 select * into album from public.community_photo_albums where id=p_album_id and status='active';
 if not found or not public.can_access_community_photos(album.community_id) then raise exception 'This album is unavailable'; end if;
 host:=public.can_manage_community(album.community_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'caption',p.caption,'status',p.status,'uploader_id',p.uploader_id,
   'uploader_name',coalesce(prof.display_name,'Member'),'created_at',p.created_at,'width',p.width,'height',p.height) order by p.created_at,p.id),'[]'::jsonb)
 into photos from public.community_album_photos p left join public.profiles prof on prof.id=p.uploader_id
 where p.album_id=p_album_id and p.status in ('pending','published','hidden','rejected','removed')
  and (host or p.status='published' or (p.uploader_id=auth.uid() and p.status in ('pending','rejected')))
  and (host or p.uploader_id is null or not public.is_blocked_pair(p.uploader_id,auth.uid()))
  and (prof.access_status is distinct from 'deleted');
 return jsonb_build_object('album',to_jsonb(album),'photos',photos,'can_manage',host,
  'can_upload',public.can_access_community_photos(album.community_id,true) and not album.is_closed
    and (host or album.contribution_mode<>'hosts_only') and coalesce((select uploads_enabled from public.community_photo_settings where community_id=album.community_id),false));
end;
$$;
create function public.get_community_photo_file(p_photo_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare photo public.community_album_photos; host boolean;
begin
 select * into photo from public.community_album_photos where id=p_photo_id;
 if not found or not public.can_access_community_photos(photo.community_id)
  or not exists(select 1 from public.community_photo_albums where id=photo.album_id and status='active')
  or exists(select 1 from public.profiles where id=photo.uploader_id and access_status='deleted') then raise exception 'This photo is unavailable'; end if;
 host:=public.can_manage_community(photo.community_id);
 if photo.status='hidden' and not host then raise exception 'This photo is unavailable'; end if;
 if photo.status not in ('published','pending','hidden') or (photo.status<>'published' and not host and photo.uploader_id is distinct from auth.uid())
  or (not host and photo.uploader_id is not null and public.is_blocked_pair(photo.uploader_id,auth.uid())) then raise exception 'This photo is unavailable'; end if;
 return photo.community_id::text||'/'||photo.id::text;
end;
$$;
create function public.review_community_album_photo(p_photo_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare photo public.community_album_photos; cid uuid; host boolean; changed text;
begin
 select community_id into cid from public.community_album_photos where id=p_photo_id;
 if cid is null or not public.can_access_community_photos(cid,true) then raise exception 'Active Community membership required'; end if;
 perform 1 from public.communities where id=cid for update;
 select * into photo from public.community_album_photos where id=p_photo_id for update;
 host:=public.can_manage_community(cid);
 if p_action='remove' and (host or photo.uploader_id=auth.uid()) and photo.status in ('pending','published','hidden','rejected') then changed:='removed';
 elsif host and p_action='approve' and photo.status='pending' then changed:='published';
 elsif host and p_action='reject' and photo.status='pending' then changed:='rejected';
 elsif host and p_action='hide' and photo.status='published' then changed:='hidden';
 elsif host and p_action='restore' and photo.status in ('hidden','removed') and (photo.removed_at is null or photo.removed_at>now()-interval '7 days') then changed:='published';
 else raise exception 'This photo cannot be changed that way'; end if;
 if not public.can_access_community_photos(cid,true) then raise exception 'Your Community is not open for changes'; end if;
 update public.community_album_photos set status=changed,removed_at=case when changed in ('removed','rejected') then now() else null end where id=p_photo_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'community.photo_'||p_action,'community_album_photo',p_photo_id,jsonb_build_object('previous_status',photo.status));
end;
$$;

create function public.claim_community_photo_cleanup(p_uploader_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare photo public.community_album_photos; output jsonb:='[]';
begin
 for photo in select p.* from public.community_album_photos p left join public.profiles prof on prof.id=p.uploader_id
 where (p_uploader_id is null or p.uploader_id=p_uploader_id) and (
  (p.status='reserved' and p.reservation_expires_at<now()) or
  (p.status='uploading' and p.upload_started_at<now()-interval '10 minutes') or
  (p.status in ('removed','rejected') and p.removed_at<now()-interval '7 days') or
  p.status='cleaning' or prof.access_status='deleted')
 order by p.created_at limit 10 for update of p skip locked
 loop
  update public.community_album_photos set status='cleaning',upload_token=null where id=photo.id;
  output:=output||jsonb_build_array(jsonb_build_object('id',photo.id,'path',photo.community_id::text||'/'||photo.id::text));
 end loop;
 return output;
end;
$$;
create function public.finish_community_photo_cleanup(p_photo_id uuid)
returns void language sql security invoker set search_path='' as $$
 delete from public.community_album_photos where id=p_photo_id and status='cleaning';
$$;
-- Never allow a browser to claim/finalise or release storage allowance.
revoke all on function public.community_photo_actor_can_upload(uuid,uuid),public.claim_community_photo_upload(uuid,uuid),
 public.finish_community_photo_upload(uuid,uuid,uuid,integer,integer,integer,text),public.reset_community_photo_upload(uuid,uuid),
 public.claim_community_photo_cleanup(uuid),public.finish_community_photo_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.community_photo_actor_can_upload(uuid,uuid),public.claim_community_photo_upload(uuid,uuid),
 public.finish_community_photo_upload(uuid,uuid,uuid,integer,integer,integer,text),public.reset_community_photo_upload(uuid,uuid),
 public.claim_community_photo_cleanup(uuid),public.finish_community_photo_cleanup(uuid) to service_role;
revoke all on function public.list_community_photo_albums(uuid),public.get_community_photo_album(uuid),public.get_community_photo_file(uuid),public.review_community_album_photo(uuid,text) from public,anon;
grant execute on function public.list_community_photo_albums(uuid),public.get_community_photo_album(uuid),public.get_community_photo_file(uuid),public.review_community_album_photo(uuid,text) to authenticated;
-- Keep uploads closed; Admin opens them only after real binary/recovery acceptance.
commit;
