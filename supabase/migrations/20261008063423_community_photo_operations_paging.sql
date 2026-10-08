begin;

create index if not exists communities_photo_operations_name_idx
 on public.communities(lower(name),id);

-- Separate name preserves the existing no-argument health/cleanup API.
create or replace function public.get_admin_community_photo_operations_page(
 p_search text default '', p_after_name text default null, p_after_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; search_text text:=btrim(coalesce(p_search,''));
begin
 if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then
  raise exception 'Super admin required';
 end if;
 if char_length(search_text)>120 then raise exception 'Use a shorter Community name'; end if;
 if (p_after_name is null) <> (p_after_id is null) or char_length(p_after_name)>160 then
  raise exception 'Invalid page position';
 end if;
 with candidates as materialized (
  select c.id,c.name,c.status,lower(c.name) sort_name
  from public.communities c
  where (search_text='' or position(lower(search_text) in lower(c.name))>0)
   and (p_after_id is null or (lower(c.name),c.id)>(p_after_name,p_after_id))
  order by lower(c.name),c.id limit 21
 ), page as materialized (
  select * from candidates order by sort_name,id limit 20
 ), rows as (
  select c.id,c.name,c.status,c.sort_name,
   coalesce(s.allowance_bytes,524288000) allowance_bytes,
   coalesce(s.uploads_enabled,false) uploads_enabled,
   coalesce((select sum(coalesce(p.stored_bytes,p.reserved_bytes))
    from public.community_album_photos p where p.community_id=c.id),0) used_bytes,
   (select count(*) from public.community_album_photos p where p.community_id=c.id
    and (p.status='cleaning' or (p.status='reserved' and p.reservation_expires_at<now())
     or (p.status='uploading' and p.upload_started_at<now()-interval '10 minutes')
     or (p.status in ('removed','rejected') and p.removed_at<now()-interval '7 days'))) waiting_cleanup
  from page c left join public.community_photo_settings s on s.community_id=c.id
 )
 select jsonb_build_object(
  'checks',(select jsonb_agg(to_jsonb(c) order by c.key) from public.community_photo_release_checks c),
  'health',(select to_jsonb(h) from public.community_photo_cleanup_health h),
  'communities',coalesce((select jsonb_agg(to_jsonb(r)-'sort_name' order by r.sort_name,r.id) from rows r),'[]'::jsonb),
  'has_more',(select count(*)>20 from candidates),
  'next_cursor',case when (select count(*)>20 from candidates) then
   (select jsonb_build_object('name',sort_name,'id',id) from page order by sort_name desc,id desc limit 1)
   else null end
 ) into result;
 return result;
end;
$$;
revoke all on function public.get_admin_community_photo_operations_page(text,text,uuid) from public,anon;
grant execute on function public.get_admin_community_photo_operations_page(text,text,uuid) to authenticated;
commit;
