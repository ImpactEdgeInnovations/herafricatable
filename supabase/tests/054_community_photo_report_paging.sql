-- Rollback-only synthetic queue test. No reports, alerts or changes remain.
begin;
create temporary table photo_report_paging_results(result text);
do $$
declare admin_id uuid; member_id uuid; dummy_id uuid; result jsonb; cursor jsonb; item jsonb;
 seen uuid[]:='{}'; fixtures integer:=0; denied boolean; reached_closed boolean:=false;
 marker text:='photo-page-'||gen_random_uuid()::text;
begin
 select id into admin_id from auth.users where email='impactedgeinnovations@gmail.com';
 if admin_id is null then raise exception 'Test admin missing'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.community_photo_reports(category,details,evidence_snapshot,status,created_at)
 select 'other','Rollback-only queue paging test.',jsonb_build_object('test_marker',marker),
  case when n<=65 then 'open' else 'dismissed' end,'2099-01-01'::timestamptz
 from generate_series(1,130) n;
 loop
  result:=public.list_community_photo_reports_page((cursor->>'active')::boolean,(cursor->>'created_at')::timestamptz,(cursor->>'id')::uuid);
  if jsonb_array_length(result->'reports')>25 then raise exception 'Unbounded report page';end if;
  for item in select value from jsonb_array_elements(result->'reports') loop
   if (item->>'report_id')::uuid=any(seen) then raise exception 'Duplicate report';end if;
   seen:=array_append(seen,(item->>'report_id')::uuid);
   if item->>'status' in ('resolved','dismissed') then reached_closed:=true;
   elsif reached_closed then raise exception 'Active report after closed reports';end if;
   if item->'evidence_snapshot'->>'test_marker'=marker then fixtures:=fixtures+1;end if;
  end loop;
  exit when not (result->>'has_more')::boolean;
  cursor:=result->'next_cursor';
  if cursor is null or cursor='null'::jsonb or cardinality(seen)>20000 then raise exception 'Invalid continuation';end if;
 end loop;
 if fixtures<>130 then raise exception 'Expected 130 fixtures, received %',fixtures;end if;
 denied:=false;
 begin perform public.list_community_photo_reports_page(true,null,gen_random_uuid());
 exception when others then if sqlerrm='Invalid report page position' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Partial cursor accepted';end if;
 select u.id into member_id from auth.users u where not exists(
  select 1 from public.user_roles r where r.user_id=u.id and r.role in ('super_admin','moderator')) limit 1;
 if member_id is null then raise exception 'Test needs an ordinary account';end if;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 denied:=false;begin perform public.list_community_photo_reports_page();
 exception when others then if sqlerrm='Moderator role required' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Member read reports';end if;
 -- An existing labelled dummy account receives a role only inside this rolled-back transaction.
 select p.id into dummy_id from public.profiles p where p.is_test_account
  and not exists(select 1 from public.user_roles r where r.user_id=p.id and r.role in ('super_admin','moderator')) limit 1;
 if dummy_id is null then raise exception 'A labelled non-admin dummy account is required';end if;
 insert into public.user_roles(user_id,role,granted_by,expires_at)
 values(dummy_id,'moderator',admin_id,now()+interval '1 hour');
 perform set_config('request.jwt.claim.sub',dummy_id::text,true);
 result:=public.list_community_photo_reports_page();
 if jsonb_typeof(result->'reports')<>'array' then raise exception 'Moderator page unavailable';end if;
 update public.user_roles set expires_at=now()-interval '1 hour' where user_id=dummy_id and role='moderator';
 denied:=false;begin perform public.list_community_photo_reports_page();
 exception when others then if sqlerrm='Moderator role required' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Expired moderator read reports';end if;
 perform set_config('request.jwt.claim.sub','',true);
 denied:=false;begin perform public.list_community_photo_reports_page();
 exception when others then if sqlerrm='Moderator role required' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Anonymous read reports';end if;
 if has_function_privilege('anon','public.list_community_photo_reports_page(boolean,timestamptz,uuid)','execute') then raise exception 'Anonymous API grant';end if;
 insert into photo_report_paging_results values('130 synthetic reports reachable without duplicates; tied timestamps, open-first ordering, bounded pages, malformed cursor, moderator access, expired-role and member/anonymous denial passed.');
end;
$$;
select * from photo_report_paging_results;
rollback;
