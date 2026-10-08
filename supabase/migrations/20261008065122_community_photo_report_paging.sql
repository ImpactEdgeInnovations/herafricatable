begin;
create index if not exists community_photo_reports_priority_page_idx
 on public.community_photo_reports((status in ('open','reviewing')) desc,created_at desc,id desc);

create or replace function public.list_community_photo_reports_page(
 p_before_active boolean default null, p_before_created_at timestamptz default null, p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_admin(array['super_admin','moderator']::public.app_role[]) then
  raise exception 'Moderator role required';
 end if;
 if num_nonnulls(p_before_active,p_before_created_at,p_before_id) not in (0,3)
  or (p_before_created_at is not null and not isfinite(p_before_created_at)) then
  raise exception 'Invalid report page position';
 end if;
 with candidates as materialized (
  select r.*,r.status in ('open','reviewing') active
  from public.community_photo_reports r
  where p_before_id is null or ((r.status in ('open','reviewing')),r.created_at,r.id)
   <(p_before_active,p_before_created_at,p_before_id)
  order by (r.status in ('open','reviewing')) desc,r.created_at desc,r.id desc limit 26
 ), page as materialized (
  select * from candidates order by active desc,created_at desc,id desc limit 25
 ), rows as (
  select r.id report_id,r.photo_id,r.community_id,coalesce(c.name,'Community') community_name,
   coalesce(p.email,'Former member') reporter_email,r.category,r.details,r.evidence_snapshot,
   r.status,r.created_at,r.blocks_photo,'photo'::text content_type,r.active
  from page r left join public.communities c on c.id=r.community_id
   left join auth.users p on p.id=r.reporter_id
 )
 select jsonb_build_object(
  'reports',coalesce((select jsonb_agg(to_jsonb(r)-'active' order by r.active desc,r.created_at desc,r.report_id desc) from rows r),'[]'::jsonb),
  'has_more',(select count(*)>25 from candidates),
  'next_cursor',case when (select count(*)>25 from candidates) then
   (select jsonb_build_object('active',active,'created_at',created_at,'id',id)
    from page order by active,created_at,id limit 1) else null end
 ) into result;
 return result;
end;
$$;
revoke all on function public.list_community_photo_reports_page(boolean,timestamptz,uuid) from public,anon;
grant execute on function public.list_community_photo_reports_page(boolean,timestamptz,uuid) to authenticated;
commit;
