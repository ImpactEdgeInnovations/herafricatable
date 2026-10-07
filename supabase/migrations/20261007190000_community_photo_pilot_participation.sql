begin;
alter table public.community_photo_settings
 add column pilot_uploads boolean not null default false,
 add column admin_paused boolean not null default false;

-- The cohort controls who can start a Community, not who can use it.
create function public.community_photo_pilot_ready(p_community_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.communities_enabled()
  and public.get_membership_intake_mode()='trusted_auto'
  and exists(select 1 from public.community_pilot_settings where id=true and enabled)
  and not exists(select 1 from public.community_photo_cleanup_health where failed>0)
  and exists(select 1 from public.communities c
   join public.community_memberships m on m.community_id=c.id and m.role='owner' and m.status='active'
   join public.community_pilot_access a on a.user_id=m.user_id
   where c.id=p_community_id and c.status='published' and public.is_active_member(m.user_id));
$$;
create function public.community_photo_uploads_open(p_community_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_photo_settings s where s.community_id=p_community_id
  and s.uploads_enabled and not s.admin_paused
  and (not s.pilot_uploads or public.community_photo_pilot_ready(p_community_id)));
$$;
revoke all on function public.community_photo_pilot_ready(uuid),public.community_photo_uploads_open(uuid) from public,anon,authenticated;
grant execute on function public.community_photo_uploads_open(uuid) to service_role;

-- An Admin pause or failed cleanup cannot be undone by a Host.
create function public.enforce_community_photo_admin_pause()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.uploads_enabled and (auth.uid() is null or public.is_admin(array['super_admin']::public.app_role[])) then
  new.admin_paused:=true;
 elsif new.uploads_enabled and public.is_admin(array['super_admin']::public.app_role[]) then
  new.admin_paused:=false;
 end if;
 return new;
end;
$$;
revoke all on function public.enforce_community_photo_admin_pause() from public,anon,authenticated;
create trigger community_photo_admin_pause before update on public.community_photo_settings
 for each row execute function public.enforce_community_photo_admin_pause();

create function public.save_pilot_community_photo_uploads(p_community_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_enabled is null or auth.uid() is null or not public.can_access_community_photos(p_community_id,true)
  or not public.can_manage_community(p_community_id) then raise exception 'Active Community Host access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('community.photo.release',0));
 perform 1 from public.communities where id=p_community_id for update;
 if p_enabled and not public.community_photo_pilot_ready(p_community_id) then raise exception 'Pilot photo sharing is not available for this Community'; end if;
 if p_enabled and not public.is_admin(array['super_admin']::public.app_role[]) and exists(select 1 from public.community_photo_settings where community_id=p_community_id and admin_paused) then
  raise exception 'Photo sharing has been paused by Admin. Ask Admin to reopen it'; end if;
 insert into public.community_photo_settings(community_id,uploads_enabled,pilot_uploads)
 values(p_community_id,p_enabled,true)
 on conflict(community_id) do update set uploads_enabled=excluded.uploads_enabled,pilot_uploads=true;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
 values(auth.uid(),'community.pilot_photo_sharing_changed','community',p_community_id,jsonb_build_object('enabled',p_enabled));
end;
$$;
revoke all on function public.save_pilot_community_photo_uploads(uuid,boolean) from public,anon;
grant execute on function public.save_pilot_community_photo_uploads(uuid,boolean) to authenticated;

alter function public.save_admin_community_photo_settings(uuid,integer,boolean,text) rename to save_admin_community_photo_settings_internal;
revoke all on function public.save_admin_community_photo_settings_internal(uuid,integer,boolean,text) from public,anon,authenticated;
create function public.save_admin_community_photo_settings(p_community_id uuid,p_allowance_mb integer,p_enabled boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super admin required'; end if;
 if p_enabled and public.community_photo_pilot_ready(p_community_id) then
  -- Validate allowance/reason through the existing production settings function.
  perform public.save_admin_community_photo_settings_internal(p_community_id,p_allowance_mb,false,p_reason);
  perform public.save_pilot_community_photo_uploads(p_community_id,true);
 else
  perform public.save_admin_community_photo_settings_internal(p_community_id,p_allowance_mb,p_enabled,p_reason);
  if p_enabled then update public.community_photo_settings set pilot_uploads=false where community_id=p_community_id; end if;
 end if;
end;
$$;
revoke all on function public.save_admin_community_photo_settings(uuid,integer,boolean,text) from public,anon;
grant execute on function public.save_admin_community_photo_settings(uuid,integer,boolean,text) to authenticated;

-- Keep the established quota, consent, review and membership checks. Internal
-- versions are not Data API endpoints; wrappers add live expiry/pause checks.
alter function public.reserve_community_album_photos(uuid,uuid,integer,boolean) rename to reserve_community_album_photos_internal;
revoke all on function public.reserve_community_album_photos_internal(uuid,uuid,integer,boolean) from public,anon,authenticated;
create function public.reserve_community_album_photos(p_album_id uuid,p_request_id uuid,p_count integer,p_permission_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 select community_id into cid from public.community_photo_albums where id=p_album_id;
 if cid is null or not public.can_access_community_photos(cid,true) then raise exception 'Active Community membership required'; end if;
 perform 1 from public.communities where id=cid for update;
 if not public.community_photo_uploads_open(cid) then raise exception 'Photo sharing is paused in this Community'; end if;
 return public.reserve_community_album_photos_internal(p_album_id,p_request_id,p_count,p_permission_confirmed);
end;
$$;
revoke all on function public.reserve_community_album_photos(uuid,uuid,integer,boolean) from public,anon;
grant execute on function public.reserve_community_album_photos(uuid,uuid,integer,boolean) to authenticated;

alter function public.community_photo_actor_can_upload(uuid,uuid) rename to community_photo_actor_can_upload_internal;
revoke all on function public.community_photo_actor_can_upload_internal(uuid,uuid) from public,anon,authenticated;
create function public.community_photo_actor_can_upload(p_photo_id uuid,p_actor uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select public.community_photo_actor_can_upload_internal(p_photo_id,p_actor)
  and exists(select 1 from public.community_album_photos p where p.id=p_photo_id and public.community_photo_uploads_open(p.community_id));
$$;
revoke all on function public.community_photo_actor_can_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.community_photo_actor_can_upload_internal(uuid,uuid),public.community_photo_actor_can_upload(uuid,uuid) to service_role;

alter function public.list_community_photo_albums(uuid) rename to list_community_photo_albums_internal;
revoke all on function public.list_community_photo_albums_internal(uuid) from public,anon,authenticated;
create function public.list_community_photo_albums(p_community_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.list_community_photo_albums_internal(p_community_id);
 return result||jsonb_build_object('uploads_enabled',public.community_photo_uploads_open(p_community_id),
  'pilot_available',public.community_photo_pilot_ready(p_community_id),
  'admin_paused',coalesce((select admin_paused from public.community_photo_settings where community_id=p_community_id),false));
end;
$$;
revoke all on function public.list_community_photo_albums(uuid) from public,anon;
grant execute on function public.list_community_photo_albums(uuid) to authenticated;

alter function public.get_community_photo_album(uuid) rename to get_community_photo_album_internal;
revoke all on function public.get_community_photo_album_internal(uuid) from public,anon,authenticated;
create function public.get_community_photo_album(p_album_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; cid uuid;
begin
 result:=public.get_community_photo_album_internal(p_album_id);
 select community_id into cid from public.community_photo_albums where id=p_album_id;
 return result||jsonb_build_object('can_upload',(result->>'can_upload')::boolean and public.community_photo_uploads_open(cid));
end;
$$;
revoke all on function public.get_community_photo_album(uuid) from public,anon;
grant execute on function public.get_community_photo_album(uuid) to authenticated;
commit;
