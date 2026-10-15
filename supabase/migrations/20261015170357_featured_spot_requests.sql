begin;
create table public.featured_spot_requests (
 id uuid primary key default gen_random_uuid(),
 event_id uuid references public.events(id) on delete cascade,
 community_id uuid references public.communities(id) on delete cascade,
 requested_by uuid not null default auth.uid() references public.profiles(id),
 reason text not null check(char_length(trim(reason)) between 10 and 600),
 requested_start timestamptz not null, requested_end timestamptz not null,
 status text not null default 'pending' check(status in ('pending','approved','declined','removed')),
 review_note text check(char_length(review_note)<=600),
 reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 check(num_nonnulls(event_id,community_id)=1),
 check(requested_end>requested_start and requested_end<=requested_start+interval '30 days')
);
create unique index featured_pending_event on public.featured_spot_requests(event_id) where status='pending';
create unique index featured_pending_community on public.featured_spot_requests(community_id) where status='pending';
create index featured_request_owner on public.featured_spot_requests(requested_by,created_at desc);
create index featured_request_reviewer on public.featured_spot_requests(reviewed_by);
create table public.featured_spot_placements (
 request_id uuid primary key references public.featured_spot_requests(id) on delete cascade,
 event_id uuid references public.events(id) on delete cascade,
 community_id uuid references public.communities(id) on delete cascade,
 starts_at timestamptz not null, ends_at timestamptz not null,
 removed boolean not null default false,
 check(num_nonnulls(event_id,community_id)=1),
 check(ends_at>starts_at and ends_at<=starts_at+interval '30 days')
);
create index featured_event_window on public.featured_spot_placements(event_id,ends_at) where not removed;
create index featured_community_window on public.featured_spot_placements(community_id,ends_at) where not removed;
alter table public.featured_spot_requests enable row level security;
alter table public.featured_spot_placements enable row level security;
revoke all on public.featured_spot_requests,public.featured_spot_placements from anon,authenticated;
grant select,insert,update on public.featured_spot_requests to authenticated;
grant select on public.featured_spot_placements to anon,authenticated;
grant insert,update on public.featured_spot_placements to authenticated;
create policy featured_request_read on public.featured_spot_requests for select to authenticated
 using(requested_by=(select auth.uid()) or public.is_admin(array['super_admin']::public.app_role[]));
create policy featured_request_create on public.featured_spot_requests for insert to authenticated
 with check(requested_by=(select auth.uid()) and public.is_active_member(auth.uid()) and status='pending'
 and reviewed_by is null and reviewed_at is null and review_note is null and requested_end>now()
 and ((event_id is not null and public.can_host_event(event_id) and exists(select 1 from public.events e where e.id=event_id and e.status='published' and e.audience='public' and e.ends_at>now()))
 or (community_id is not null and public.can_manage_community(community_id) and exists(select 1 from public.communities c where c.id=community_id and c.status='published' and c.public_preview_enabled))));
create policy featured_request_review on public.featured_spot_requests for update to authenticated
 using(public.is_admin(array['super_admin']::public.app_role[])) with check(public.is_admin(array['super_admin']::public.app_role[]));
create policy featured_placement_read on public.featured_spot_placements for select to anon,authenticated
 using((not removed and starts_at<=now() and ends_at>now() and
 ((event_id is not null and exists(select 1 from public.events e where e.id=event_id and e.status='published' and e.audience='public' and e.ends_at>now()))
 or (community_id is not null and exists(select 1 from public.communities c where c.id=community_id and c.status='published' and c.public_preview_enabled))))
 or public.is_admin(array['super_admin']::public.app_role[]));
create policy featured_placement_create on public.featured_spot_placements for insert to authenticated
 with check(public.is_admin(array['super_admin']::public.app_role[]));
create policy featured_placement_review on public.featured_spot_placements for update to authenticated
 using(public.is_admin(array['super_admin']::public.app_role[])) with check(public.is_admin(array['super_admin']::public.app_role[]));

create function public.request_featured_spot(p_kind text,p_target uuid,p_reason text,p_start timestamptz,p_end timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare saved uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to send a request'; end if;
 if p_kind not in ('event','community') or p_kind is null then raise exception 'Choose an event or Community'; end if;
 if p_start is null or p_end is null or p_end<=now() or p_end<=p_start or p_end>p_start+interval '30 days' then raise exception 'Choose a future period of up to 30 days'; end if;
 if p_kind='event' and not exists(select 1 from public.events where id=p_target and status='published' and audience='public' and ends_at>now()) then raise exception 'Publish a public event before requesting a featured spot'; end if;
 if p_kind='community' and not exists(select 1 from public.communities where id=p_target and status='published' and public_preview_enabled) then raise exception 'Turn on your Community public preview before requesting a featured spot'; end if;
 insert into public.featured_spot_requests(event_id,community_id,reason,requested_start,requested_end)
 values(case when p_kind='event' then p_target end,case when p_kind='community' then p_target end,trim(p_reason),p_start,p_end) returning id into saved;
 return saved;
exception when unique_violation then raise exception 'A request is already waiting for a decision';
end; $$;

create function public.review_featured_spot(p_id uuid,p_decision text,p_start timestamptz default null,p_end timestamptz default null,p_note text default '')
returns void language plpgsql security invoker set search_path='' as $$
declare item public.featured_spot_requests%rowtype;
begin
 if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super Admin access required'; end if;
 if p_decision is null or p_decision not in ('approved','declined','removed') then raise exception 'Choose a decision'; end if;
 perform pg_catalog.pg_advisory_xact_lock(15102026);
 select * into item from public.featured_spot_requests where id=p_id for update;
 if not found then raise exception 'Request not found'; end if;
 if item.status not in ('pending','approved') then raise exception 'This request already has a final decision'; end if;
 if p_decision in ('declined','removed') and length(trim(coalesce(p_note,'')))<3 then raise exception 'Add a short note for the Host'; end if;
 if p_decision='approved' then
   if p_start is null or p_end is null or p_end<=now() or p_end<=p_start or p_end>p_start+interval '30 days' then raise exception 'Choose a future period of up to 30 days'; end if;
   if item.event_id is not null and not exists(select 1 from public.events where id=item.event_id and status='published' and audience='public' and ends_at>=p_end) then raise exception 'Choose a published public event and finish the placement before the event ends'; end if;
   if item.community_id is not null and not exists(select 1 from public.communities where id=item.community_id and status='published' and public_preview_enabled) then raise exception 'This Community needs a published public preview'; end if;
   if exists(select 1 from public.featured_spot_placements p where p.request_id<>p_id and not p.removed and p.starts_at<p_end and p.ends_at>p_start and (p.event_id=item.event_id or p.community_id=item.community_id)) then raise exception 'This item already has a featured spot during these dates'; end if;
   if (select count(*) from public.featured_spot_placements p where p.request_id<>p_id and not p.removed and p.starts_at<p_end and p.ends_at>p_start and (p.event_id is not null)=(item.event_id is not null))>=3 then raise exception 'Three spots are already booked during these dates. Choose another period'; end if;
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
revoke all on function public.request_featured_spot(text,uuid,text,timestamptz,timestamptz),public.review_featured_spot(uuid,text,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.request_featured_spot(text,uuid,text,timestamptz,timestamptz),public.review_featured_spot(uuid,text,timestamptz,timestamptz,text) to authenticated;
commit;
