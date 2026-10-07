-- Rollback-only acceptance; no real Host details are published. Not a migration.
begin;
create temporary table host_public_results(result text);
do $$
declare eid uuid; host_uid uuid; outsider uuid; denied boolean;
begin
  select h.event_id,h.user_id into strict eid,host_uid from public.event_hosts h join public.events e on e.id=h.event_id join public.profiles p on p.id=h.user_id where h.status='active' and e.status='published' and e.audience='public' and e.ends_at>now() and p.access_status='active' limit 1;
  select p.id into strict outsider from public.profiles p where p.id<>host_uid and p.access_status='active' and not exists(select 1 from public.event_hosts h where h.event_id=eid and h.user_id=p.id) limit 1;
  perform set_config('request.jwt.claim.sub',host_uid::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',host_uid,'role','authenticated')::text,true);
  perform public.save_event_host_public_details(eid,jsonb_build_object('display_name','Test Host','enabled',false));
  if exists(select 1 from public.get_event_public_host(eid)) then raise exception 'Disabled details exposed';end if;
  perform public.save_event_host_public_details(eid,jsonb_build_object('display_name','Test Host','enabled',true,'contact_email','host@example.com','linkedin_url','https://www.linkedin.com/in/example'));
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  if not exists(select 1 from public.get_event_public_host(eid) where display_name='Test Host' and contact_email='host@example.com') then raise exception 'Explicit public Host details unavailable';end if;
  if has_function_privilege('anon','public.save_event_host_public_details(uuid,jsonb)','execute') or has_table_privilege('anon','public.event_host_public_details','select') or has_table_privilege('authenticated','public.event_host_public_details','update') then raise exception 'Excessive raw privileges';end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',outsider,'role','authenticated')::text,true);
  denied:=false;begin perform public.save_event_host_public_details(eid,'{"display_name":"Intruder","enabled":true}');exception when others then denied:=true;end;
  if not denied then raise exception 'Unrelated account edited Host';end if;
  perform set_config('request.jwt.claim.sub',host_uid::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',host_uid,'role','authenticated')::text,true);
  denied:=false;begin perform public.save_event_host_public_details(eid,'{"display_name":"Test Host","enabled":true,"website_url":"javascript:alert(1)"}');exception when others then denied:=true;end;
  if not denied then raise exception 'Unsafe URL accepted';end if;
  update public.event_hosts set status='paused' where event_id=eid and user_id=host_uid;
  if exists(select 1 from public.get_event_public_host(eid)) then raise exception 'Paused Host details exposed';end if;
  denied:=false;begin perform public.save_event_host_public_details(eid,'{"display_name":"Test Host","enabled":false}');exception when others then denied:=true;end;
  if not denied then raise exception 'Paused Host edited details';end if;
  insert into host_public_results values('PASS: opt-in exposure, explicit contacts, no raw anonymous reads, unrelated and paused Host denial, unsafe URL rejection');
end; $$;
select * from host_public_results;
rollback;
