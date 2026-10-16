begin;

alter table public.community_photo_albums add column if not exists cover_photo_id uuid
  references public.community_album_photos(id) on delete set null;
create index if not exists community_album_cover_fk_idx on public.community_photo_albums(cover_photo_id) where cover_photo_id is not null;
create index if not exists community_album_photo_page_idx on public.community_album_photos(album_id,created_at,id);

-- Internal resolver. Never expose hidden, pending, held, deleted-uploader or
-- blocked-member photos as the public-to-members album cover.
create or replace function public.community_album_cover_for_viewer(p_album_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.community_photo_albums a
 join public.community_album_photos p on p.album_id=a.id
 left join public.profiles profile on profile.id=p.uploader_id
 where a.id=p_album_id and a.status='active'
  and public.can_access_community_photos(a.community_id)
  and p.status='published' and not p.admin_hidden and profile.access_status is distinct from 'deleted'
  and (public.can_manage_community(a.community_id) or p.uploader_id is null or not public.is_blocked_pair(p.uploader_id,auth.uid()))
 order by (p.id=a.cover_photo_id) desc,p.created_at,p.id limit 1;
$$;
revoke all on function public.community_album_cover_for_viewer(uuid) from public,anon,authenticated;

create or replace function public.save_community_album_cover(p_album_id uuid,p_photo_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 select community_id into cid from public.community_photo_albums where id=p_album_id and status='active';
 if cid is null or auth.uid() is null or not public.can_access_community_photos(cid,true) or not public.can_manage_community(cid) then
  raise exception 'Active Community Host access required' using errcode='42501'; end if;
 perform 1 from public.communities where id=cid for update;
 perform 1 from public.community_photo_albums where id=p_album_id and status='active' for update;
 if not found or not public.can_access_community_photos(cid,true) or not public.can_manage_community(cid) then
  raise exception 'This album is unavailable' using errcode='42501'; end if;
 if p_photo_id is not null and not exists(select 1 from public.community_album_photos p left join public.profiles profile on profile.id=p.uploader_id
  where p.id=p_photo_id and p.album_id=p_album_id and p.status='published' and not p.admin_hidden and profile.access_status is distinct from 'deleted') then
  raise exception 'Choose an approved photo from this album'; end if;
 update public.community_photo_albums set cover_photo_id=p_photo_id where id=p_album_id;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'community.album_cover_saved','community_photo_album',p_album_id,jsonb_build_object('photo_id',p_photo_id));
 return public.community_album_cover_for_viewer(p_album_id);
end;
$$;
revoke all on function public.save_community_album_cover(uuid,uuid) from public,anon;
grant execute on function public.save_community_album_cover(uuid,uuid) to authenticated;

create or replace function public.list_community_photo_albums(p_community_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; albums jsonb; host boolean;
begin
 result:=public.list_community_photo_albums_internal(p_community_id);
 host:=public.can_manage_community(p_community_id);
 select coalesce(jsonb_agg(item || jsonb_build_object('cover_photo_id',public.community_album_cover_for_viewer((item->>'id')::uuid),
  'photo_count',(select count(*) from public.community_album_photos p left join public.profiles profile on profile.id=p.uploader_id
   where p.album_id=(item->>'id')::uuid and p.status='published' and not p.admin_hidden and profile.access_status is distinct from 'deleted'
    and (host or p.uploader_id is null or not public.is_blocked_pair(p.uploader_id,auth.uid())))) order by position),'[]'::jsonb)
 into albums from jsonb_array_elements(result->'albums') with ordinality as entries(item,position);
 return result || jsonb_build_object('albums',albums,'uploads_enabled',public.community_photo_uploads_open(p_community_id),
  'pilot_available',public.community_photo_pilot_ready(p_community_id),
  'admin_paused',coalesce((select admin_paused from public.community_photo_settings where community_id=p_community_id),false));
end;
$$;

create or replace function public.get_community_photo_album_page(p_album_id uuid,p_after uuid default null,p_limit integer default 24)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare album public.community_photo_albums; host boolean; photos jsonb; more boolean; cursor_time timestamptz; cover_id uuid;
 page_size integer:=least(greatest(coalesce(p_limit,24),1),100); next_id uuid; total integer; event_title text;
begin
 select * into album from public.community_photo_albums where id=p_album_id and status='active';
 if not found or not public.can_access_community_photos(album.community_id) then raise exception 'This album is unavailable' using errcode='42501'; end if;
 host:=public.can_manage_community(album.community_id);
 if p_after is not null then
  select created_at into cursor_time from public.community_album_photos where id=p_after and album_id=p_album_id;
  if not found then raise exception 'This page position has expired. Reopen the album'; end if;
 end if;
 select e.title into event_title from public.community_gathering_rooms room join public.events e on e.id=room.event_id where room.id=album.room_id;
 with eligible as (
  select p.id,p.caption,p.status,p.uploader_id,coalesce(profile.display_name,'Member') uploader_name,p.created_at,p.width,p.height
  from public.community_album_photos p left join public.profiles profile on profile.id=p.uploader_id
  where p.album_id=p_album_id and p.status in ('pending','published','hidden','rejected','removed')
   and (host or p.status='published' or (p.uploader_id=auth.uid() and p.status in ('pending','rejected')))
   and (host or p.uploader_id is null or not public.is_blocked_pair(p.uploader_id,auth.uid()))
   and profile.access_status is distinct from 'deleted'
 ), page as (
  select * from eligible where p_after is null or (created_at,id)>(cursor_time,p_after) order by created_at,id limit page_size+1
 ), numbered as (select *,row_number() over(order by created_at,id) n from page)
 select coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by created_at,id) filter(where n<=page_size),'[]'::jsonb),
  count(*)>page_size,(select count(*) from eligible) into photos,more,total from numbered;
 next_id:=nullif(photos->-1->>'id','')::uuid;
 cover_id:=public.community_album_cover_for_viewer(p_album_id);
 return jsonb_build_object('album',(to_jsonb(album)-'cover_photo_id')||jsonb_build_object('cover_photo_id',cover_id,
  'cover_is_custom',coalesce(cover_id=album.cover_photo_id,false),'gathering_title',event_title),
  'photos',photos,'has_more',more,'next_cursor',case when more then next_id else null end,'total_count',total,'can_manage',host,
  'can_upload',public.can_access_community_photos(album.community_id,true) and not album.is_closed
   and (host or album.contribution_mode<>'hosts_only') and public.community_photo_uploads_open(album.community_id));
end;
$$;
revoke all on function public.get_community_photo_album_page(uuid,uuid,integer) from public,anon;
grant execute on function public.get_community_photo_album_page(uuid,uuid,integer) to authenticated;

-- Retain the old bounded (100-photo quota) API for earlier clients, without
-- leaking a stored cover pointer that is no longer visible to this viewer.
create or replace function public.get_community_photo_album(p_album_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.get_community_photo_album_page(p_album_id,null,100);
$$;
revoke all on function public.get_community_photo_album(uuid),public.list_community_photo_albums(uuid) from public,anon;
grant execute on function public.get_community_photo_album(uuid),public.list_community_photo_albums(uuid) to authenticated;

commit;
