-- TEST ONLY: tagged Host, synthetic records, all changes roll back.
begin;
create temporary table featured_capacity_results(result text);
do $$
declare host_id uuid; admin_id uuid; eid uuid; ids uuid[]:='{}'; rid uuid; n integer; denied boolean;
begin
 select u.id into strict host_id from auth.users u join public.profiles p on p.id=u.id where u.email='community.host@hat-test.invalid' and p.is_test_account and p.access_status='active';
 select user_id into strict admin_id from public.user_roles where role='super_admin' limit 1;
 for n in 1..8 loop
   eid:=gen_random_uuid();
   insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,created_by) values(eid,'featured-capacity-test-'||eid,'[TEST] Featured capacity','virtual','public','published',now()+interval '20 days',now()+interval '21 days','closed',host_id);
   insert into public.event_hosts(event_id,user_id,assigned_by) values(eid,host_id,host_id);
   perform set_config('request.jwt.claim.sub',host_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',host_id,'role','authenticated')::text,true);execute 'set local role authenticated';
   rid:=public.request_featured_spot('event',eid,'Synthetic capacity verification request.',now()+interval '1 day',now()+interval '4 days');
   ids:=array_append(ids,rid);execute 'reset role';
 end loop;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);execute 'set local role authenticated';
 for n in 1..3 loop perform public.review_featured_spot(ids[n],'approved',now()+interval '1 day',now()+interval '2 days','Test approval.');end loop;
 denied:=false;begin perform public.review_featured_spot(ids[4],'approved',now()+interval '1 day',now()+interval '2 days','Fourth spot.');exception when others then if sqlerrm='Three spots are already booked during these dates. Choose another period' then denied:=true;else raise;end if;end;if not denied then raise exception 'Fourth simultaneous placement allowed';end if;
 if not exists(select 1 from public.featured_spot_requests where id=ids[4] and status='pending') then raise exception 'Failed approval changed request';end if;
 denied:=false;begin perform public.review_featured_spot(ids[1],'declined',null,null,'Stale decline.');exception when others then if sqlerrm='This request has changed. Refresh requests before deciding' then denied:=true;else raise;end if;end;if not denied then raise exception 'Stale decline overwrote approval';end if;
 denied:=false;begin perform public.review_featured_spot(ids[1],'approved',now()+interval '2 days',now()+interval '3 days','Stale approval.');exception when others then if sqlerrm='This request has changed. Refresh requests before deciding' then denied:=true;else raise;end if;end;if not denied then raise exception 'Stale approval rescheduled spot';end if;
 perform public.review_featured_spot(ids[1],'removed',null,null,'Release test spot.');
 perform public.review_featured_spot(ids[4],'approved',now()+interval '1 day',now()+interval '2 days','Reused released spot.');
 perform public.review_featured_spot(ids[5],'approved',now()+interval '2 days',now()+interval '3 days','Adjacent dates.');
 for n in 2..4 loop perform public.review_featured_spot(ids[n],'removed',null,null,'Release test spot.');end loop;
 perform public.review_featured_spot(ids[6],'approved',now()+interval '1 day',now()+interval '2 days','First separate period.');
 perform public.review_featured_spot(ids[7],'approved',now()+interval '3 days',now()+interval '4 days','Third separate period.');
 perform public.review_featured_spot(ids[8],'approved',now()+interval '1 day',now()+interval '4 days','Fits alongside three non-concurrent periods.');
 if (select count(*) from public.featured_spot_placements where request_id=any(ids) and not removed)<>4 then raise exception 'Non-concurrent periods were wrongly rejected';end if;
 execute 'reset role';
 insert into featured_capacity_results values('PASS L2: three spots accepted, fourth simultaneous spot rejected without state change, released spot reused, adjoining periods accepted, three disjoint periods do not block a long placement, stale approve/decline denied. All records roll back.');
end $$;
select * from featured_capacity_results;
rollback;
