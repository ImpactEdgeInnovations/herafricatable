begin;
create or replace function public.review_featured_spot(p_id uuid,p_decision text,p_start timestamptz default null,p_end timestamptz default null,p_note text default '')
returns void language plpgsql security invoker set search_path='' as $$
declare item public.featured_spot_requests%rowtype;
begin
 if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super Admin access required'; end if;
 if p_decision is null or p_decision not in ('approved','declined','removed') then raise exception 'Choose a decision'; end if;
 perform pg_catalog.pg_advisory_xact_lock(15102026);
 select * into item from public.featured_spot_requests where id=p_id for update;
 if not found then raise exception 'Request not found'; end if;
 if (p_decision in ('approved','declined') and item.status<>'pending') or (p_decision='removed' and item.status<>'approved') then raise exception 'This request has changed. Refresh requests before deciding'; end if;
 if p_decision in ('declined','removed') and length(trim(coalesce(p_note,'')))<3 then raise exception 'Add a short note for the Host'; end if;
 if p_decision='approved' then
   if p_start is null or p_end is null or p_end<=now() or p_end<=p_start or p_end>p_start+interval '30 days' then raise exception 'Choose a future period of up to 30 days'; end if;
   if item.event_id is not null and not exists(select 1 from public.events where id=item.event_id and status='published' and audience='public' and ends_at>=p_end) then raise exception 'Choose a published public event and finish the placement before the event ends'; end if;
   if item.community_id is not null and not exists(select 1 from public.communities where id=item.community_id and status='published' and public_preview_enabled) then raise exception 'This Community needs a published public preview'; end if;
   if exists(select 1 from public.featured_spot_placements p where p.request_id<>p_id and not p.removed and p.starts_at<p_end and p.ends_at>p_start and (p.event_id=item.event_id or p.community_id=item.community_id)) then raise exception 'This item already has a featured spot during these dates'; end if;
   -- A fourth placement is blocked only where three existing periods coincide.
   -- Starts are inclusive; ends are exclusive, so adjoining periods may reuse a spot.
   if exists (
     with overlapping as (
       select p.starts_at,p.ends_at from public.featured_spot_placements p
       where p.request_id<>p_id and not p.removed and p.starts_at<p_end and p.ends_at>p_start
         and (p.event_id is not null)=(item.event_id is not null)
     ), boundaries as (select p_start as at_time union select starts_at from overlapping where starts_at>=p_start)
     select 1 from boundaries b where (select count(*) from overlapping o where o.starts_at<=b.at_time and o.ends_at>b.at_time)>=3
   ) then raise exception 'Three spots are already booked during these dates. Choose another period'; end if;
   insert into public.featured_spot_placements(request_id,event_id,community_id,starts_at,ends_at)
   values(p_id,item.event_id,item.community_id,p_start,p_end)
   on conflict(request_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,removed=false;
 else
   update public.featured_spot_placements set removed=true where request_id=p_id;
 end if;
 update public.featured_spot_requests set status=p_decision,review_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),reviewed_at=now(),
 requested_start=case when p_decision='approved' then p_start else requested_start end,
 requested_end=case when p_decision='approved' then p_end else requested_end end where id=p_id;
end; $$;

commit;
