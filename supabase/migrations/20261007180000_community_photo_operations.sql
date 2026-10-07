begin;
create table public.community_photo_release_checks (
 key text primary key check(key in ('binary_delivery','access_control','cleanup_recovery','mobile_review')),
 passed boolean not null default false, evidence text not null default '',
 checked_by uuid references public.profiles(id) on delete set null, checked_at timestamptz
);
insert into public.community_photo_release_checks(key) values('binary_delivery'),('access_control'),('cleanup_recovery'),('mobile_review');
create table public.community_photo_cleanup_health (
 singleton boolean primary key default true check(singleton),
 finished_at timestamptz not null, removed integer not null check(removed between 0 and 10),
 failed integer not null check(failed between 0 and 10)
);
alter table public.community_photo_release_checks enable row level security;
alter table public.community_photo_cleanup_health enable row level security;
revoke all on public.community_photo_release_checks,public.community_photo_cleanup_health from public,anon,authenticated;
grant all on public.community_photo_release_checks,public.community_photo_cleanup_health to service_role;

create function public.record_community_photo_cleanup_health(p_removed integer,p_failed integer)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('community.photo.release',0));
 insert into public.community_photo_cleanup_health(singleton,finished_at,removed,failed) values(true,clock_timestamp(),p_removed,p_failed)
 on conflict(singleton) do update set finished_at=excluded.finished_at,removed=excluded.removed,failed=excluded.failed;
 if p_failed>0 then update public.community_photo_settings set uploads_enabled=false; end if;
end;
$$;
revoke all on function public.record_community_photo_cleanup_health(integer,integer) from public,anon,authenticated;
grant execute on function public.record_community_photo_cleanup_health(integer,integer) to service_role;

create function public.save_community_photo_release_check(p_key text,p_passed boolean,p_evidence text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super admin required'; end if;
 if p_passed is null or char_length(btrim(coalesce(p_evidence,''))) not between 10 and 1000 then raise exception 'Add the test result and when it was checked'; end if;
 perform pg_advisory_xact_lock(hashtextextended('community.photo.release',0));
 update public.community_photo_release_checks set passed=p_passed,evidence=btrim(p_evidence),checked_by=auth.uid(),checked_at=now() where key=p_key;
 if not found then raise exception 'Choose a photo check'; end if;
 if not p_passed then update public.community_photo_settings set uploads_enabled=false; end if;
 insert into public.audit_events(actor_id,action,target_type,metadata) values(auth.uid(),'community.photo_release_checked','community_photo_release',jsonb_build_object('check',p_key,'passed',p_passed,'evidence',btrim(p_evidence)));
end;
$$;
create function public.save_admin_community_photo_settings(p_community_id uuid,p_allowance_mb integer,p_enabled boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare used bigint;
begin
 if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super admin required'; end if;
 if p_allowance_mb is null or p_allowance_mb not between 2 and 10240 or p_enabled is null or char_length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Choose a 2–10240 MB allowance and add a short reason'; end if;
 perform pg_advisory_xact_lock(hashtextextended('community.photo.release',0));
 perform 1 from public.communities where id=p_community_id for update;
 if not found then raise exception 'Community not found'; end if;
 select coalesce(sum(coalesce(stored_bytes,reserved_bytes)),0) into used from public.community_album_photos where community_id=p_community_id;
 if p_allowance_mb::bigint*1048576<used then raise exception 'The allowance cannot be smaller than the photos and pending uploads already stored'; end if;
 if p_enabled and (not public.communities_enabled() or not exists(select 1 from public.communities where id=p_community_id and status='published')) then raise exception 'Open this Community before allowing photos'; end if;
 if p_enabled and ((select count(*) from public.community_photo_release_checks where passed)<>4
  or not exists(select 1 from public.community_photo_cleanup_health where failed=0 and finished_at>now()-interval '48 hours')) then
  raise exception 'Complete the four real photo checks and a successful cleanup run before opening uploads'; end if;
 insert into public.community_photo_settings(community_id,allowance_bytes,uploads_enabled) values(p_community_id,p_allowance_mb::bigint*1048576,p_enabled)
 on conflict(community_id) do update set allowance_bytes=excluded.allowance_bytes,uploads_enabled=excluded.uploads_enabled;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'community.photo_settings_changed','community',p_community_id,jsonb_build_object('allowance_mb',p_allowance_mb,'enabled',p_enabled,'reason',btrim(p_reason)));
end;
$$;
create function public.get_admin_community_photo_operations()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare checks jsonb; health jsonb; communities jsonb;
begin
 if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super admin required'; end if;
 select jsonb_agg(to_jsonb(c) order by c.key) into checks from public.community_photo_release_checks c;
 select to_jsonb(h) into health from public.community_photo_cleanup_health h;
 select coalesce(jsonb_agg(to_jsonb(item) order by item.name),'[]') into communities from (
  select c.id,c.name,c.status,coalesce(s.allowance_bytes,524288000) allowance_bytes,coalesce(s.uploads_enabled,false) uploads_enabled,
   coalesce((select sum(coalesce(p.stored_bytes,p.reserved_bytes)) from public.community_album_photos p where p.community_id=c.id),0) used_bytes,
   (select count(*) from public.community_album_photos p where p.community_id=c.id and (p.status='cleaning' or (p.status='reserved' and p.reservation_expires_at<now()) or (p.status='uploading' and p.upload_started_at<now()-interval '10 minutes') or (p.status in ('removed','rejected') and p.removed_at<now()-interval '7 days'))) waiting_cleanup
  from public.communities c left join public.community_photo_settings s on s.community_id=c.id
  order by (c.status='published') desc,c.name,c.id limit 100
 ) item;
 return jsonb_build_object('checks',checks,'health',health,'communities',communities);
end;
$$;
revoke all on function public.save_community_photo_release_check(text,boolean,text),public.save_admin_community_photo_settings(uuid,integer,boolean,text),public.get_admin_community_photo_operations() from public,anon;
grant execute on function public.save_community_photo_release_check(text,boolean,text),public.save_admin_community_photo_settings(uuid,integer,boolean,text),public.get_admin_community_photo_operations() to authenticated;
commit;
