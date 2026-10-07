-- Acceptance only; every change rolls back. Not a migration.
begin;
create temporary table gathering_access_results(result text);
do $$
declare cid uuid; owner_id uuid; rid uuid; denied boolean;
begin
  select c.id,m.user_id into strict cid,owner_id from public.communities c
    join public.community_memberships m on m.community_id=c.id and m.role='owner' and m.status='active'
    where c.slug='lavington-women' and c.status='published';
  select id into strict rid from public.community_gathering_rooms where community_id=cid limit 1;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  if not public.can_access_community_gathering(rid) then raise exception 'Active Host denied'; end if;
  if public.can_access_community_gathering(gen_random_uuid()) then raise exception 'Missing room permitted'; end if;
  update public.profiles set access_status='suspended' where id=owner_id;
  if public.can_access_community_gathering(rid) then raise exception 'Suspended Host retained room access'; end if;
  denied:=false; begin perform public.list_community_gathering_messages(rid); exception when others then denied:=true; end;
  if not denied then raise exception 'Legacy message endpoint bypassed suspension'; end if;
  denied:=false; begin perform public.list_community_gathering_chat(rid); exception when others then denied:=true; end;
  if not denied then raise exception 'New message endpoint bypassed suspension'; end if;
  update public.profiles set access_status='active' where id=owner_id;
  update public.communities set status='archived' where id=cid;
  if public.can_access_community_gathering(rid) then raise exception 'Archived Community retained access'; end if;
  denied:=false; begin perform public.send_community_gathering_message(rid,'Must not send in archived Community'); exception when others then denied:=true; end;
  if not denied then raise exception 'Archived Community accepted message'; end if;
  update public.communities set status='published' where id=cid;
  if not public.can_access_community_gathering(rid) then raise exception 'Restored Community remained unavailable'; end if;
  if has_function_privilege('anon','public.can_access_community_gathering(uuid,uuid)','execute') then raise exception 'Anonymous helper grant retained'; end if;
  insert into gathering_access_results values('PASS: active Host, missing room denial, current suspension denial on old/new endpoints, archived Community send denial, restoration and anonymous restriction');
end; $$;
select * from gathering_access_results;
rollback;
