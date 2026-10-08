-- Rollback-only synthetic paging test. Does not open uploads or certify real files.
begin;
create temporary table photo_paging_results(result text);
do $$
declare admin_id uuid; member_id uuid; result jsonb; cursor jsonb;
 seen uuid[]:='{}'; item jsonb; count_rows integer:=0; denied boolean;
 prefix text:='Photo paging '||gen_random_uuid()::text||' ';
begin
 select id into admin_id from auth.users where email='impactedgeinnovations@gmail.com';
 if admin_id is null then raise exception 'Test admin is missing'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.communities(slug,name,description,created_by,status)
 select 'photo-page-'||gen_random_uuid()::text,prefix||lpad(n::text,3,'0'),
  'Rollback-only photo operations paging fixture.',admin_id,'draft'
 from generate_series(1,125) n;
 loop
  result:=public.get_admin_community_photo_operations_page(prefix,cursor->>'name',(cursor->>'id')::uuid);
  if jsonb_array_length(result->'communities')>20 then raise exception 'Unbounded page'; end if;
  for item in select value from jsonb_array_elements(result->'communities') loop
   if (item->>'id')::uuid=any(seen) then raise exception 'Duplicate page row'; end if;
   seen:=array_append(seen,(item->>'id')::uuid);count_rows:=count_rows+1;
  end loop;
  exit when not (result->>'has_more')::boolean;
  cursor:=result->'next_cursor';
  if cursor is null or cursor='null'::jsonb or count_rows>125 then raise exception 'Invalid continuation'; end if;
 end loop;
 if count_rows<>125 then raise exception 'Expected 125 rows, received %',count_rows; end if;
 result:=public.get_admin_community_photo_operations_page(prefix||'125');
 if jsonb_array_length(result->'communities')<>1 then raise exception 'Search missed row beyond legacy cap'; end if;
 result:=public.get_admin_community_photo_operations_page(prefix||'%');
 if jsonb_array_length(result->'communities')<>0 then raise exception 'Search interpreted wildcard'; end if;
 denied:=false;
 begin perform public.get_admin_community_photo_operations_page('',null,gen_random_uuid());
 exception when others then if sqlerrm='Invalid page position' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Partial cursor accepted';end if;
 select u.id into member_id from auth.users u where not exists(
  select 1 from public.user_roles r where r.user_id=u.id and r.role='super_admin') limit 1;
 if member_id is null then raise exception 'Test needs a non-admin account';end if;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 denied:=false;
 begin perform public.get_admin_community_photo_operations_page();
 exception when others then if sqlerrm='Super admin required' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Non-admin read photo operations';end if;
 perform set_config('request.jwt.claim.sub','',true);
 denied:=false;
 begin perform public.get_admin_community_photo_operations_page();
 exception when others then if sqlerrm='Super admin required' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Anonymous read photo operations';end if;
 if has_function_privilege('anon','public.get_admin_community_photo_operations_page(text,text,uuid)','execute') then
  raise exception 'Anonymous API grant present';end if;
 insert into photo_paging_results values('125 Communities across seven bounded pages; search beyond 100, literal search, cursor validation, non-admin and anonymous denial passed.');
end;
$$;
select * from photo_paging_results;
rollback;
