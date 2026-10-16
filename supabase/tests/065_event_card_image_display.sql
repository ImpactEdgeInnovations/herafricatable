-- TEST ONLY: synthetic private event and tagged identities; everything rolls back.
begin;
create temporary table image_display_results(result text);
do $$
declare host_id uuid; other_id uuid; admin_id uuid; eid uuid := gen_random_uuid(); refused boolean;
begin
  select u.id into strict host_id from auth.users u join public.profiles p on p.id=u.id where u.email='community.member.one@hat-test.invalid' and p.is_test_account and p.access_status='active';
  select u.id into strict other_id from auth.users u join public.profiles p on p.id=u.id where u.email='community.member.two@hat-test.invalid' and p.is_test_account;
  select user_id into strict admin_id from public.user_roles where role='super_admin' and (expires_at is null or expires_at>now()) limit 1;
  insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,created_by)
    values(eid,'image-display-test-'||eid,'[TEST] Image display','virtual','public','draft',now()+interval '10 days',now()+interval '11 days','closed',admin_id);
  insert into public.event_hosts(event_id,user_id,assigned_by) values(eid,host_id,admin_id);

  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  if exists(select 1 from public.list_event_card_image_styles(array[eid])) then raise exception 'Anonymous private-event leak';end if;
  refused:=false;begin perform public.save_event_card_image_style(eid,'complete');exception when insufficient_privilege then refused:=true;end;
  if not refused then raise exception 'Anonymous write allowed';end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',other_id::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.list_event_card_image_styles(array[eid])) then raise exception 'Unrelated member private-event leak';end if;
  refused:=false;begin perform public.save_event_card_image_style(eid,'complete');exception when insufficient_privilege then refused:=true;end;
  if not refused then raise exception 'Unrelated member write allowed';end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',host_id::text,true);
  execute 'set local role authenticated';
  if (select image_style from public.list_event_card_image_styles(array[eid])) is distinct from 'automatic' then raise exception 'Default missing';end if;
  perform public.save_event_card_image_style(eid,'complete');
  if (select image_style from public.list_event_card_image_styles(array[eid])) is distinct from 'complete' then raise exception 'Host save/read did not persist';end if;
  refused:=false;begin perform public.save_event_card_image_style(eid,null);exception when raise_exception then refused:=true;end;
  if not refused then raise exception 'Null style allowed';end if;
  refused:=false;begin perform public.save_event_card_image_style(eid,'invalid');exception when raise_exception then refused:=true;end;
  if not refused then raise exception 'Invalid style allowed';end if;
  execute 'reset role';
  update public.event_hosts set status='paused' where event_id=eid;
  execute 'set local role authenticated';
  refused:=false;begin perform public.save_event_card_image_style(eid,'automatic');exception when insufficient_privilege then refused:=true;end;
  if not refused then raise exception 'Paused Host write allowed';end if;
  execute 'reset role';
  insert into image_display_results values('PASS: scoped save/read, defaults, null/invalid refusal, anonymous/unrelated denial and paused Host denial');
end;
$$;
select * from image_display_results;
rollback;
