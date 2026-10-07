-- Rollback-only acceptance. Not a migration.
begin;
create temporary table appearance_results(result text);
do $$
declare eid uuid; actor uuid; key text; denied boolean;
begin
  select e.id,h.user_id into strict eid,actor from public.events e
    join public.event_hosts h on h.event_id=e.id and h.status='active'
    join public.profiles p on p.id=h.user_id and p.access_status='active'
    where e.status in ('draft','published') and e.ends_at>now() limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  foreach key in array array['wine','gold','forest','ocean','terracotta'] loop
    perform public.set_event_appearance(eid,key);
    if not exists(select 1 from public.events where id=eid and appearance_accent_key=key) then raise exception 'Colour did not persist'; end if;
  end loop;
  denied:=false; begin perform public.set_event_appearance(eid,'#000000'); exception when others then denied:=sqlerrm like '%available colours%'; end;
  if not denied then raise exception 'Arbitrary colour accepted'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  denied:=false; begin perform public.set_event_appearance(eid,'wine'); exception when others then denied:=sqlerrm like '%Event Host or Admin required%'; end;
  if not denied or has_function_privilege('anon','public.set_event_appearance(uuid,text)','execute') then raise exception 'Unauthorised colour write allowed'; end if;
  insert into appearance_results values('PASS: five persisted presets, arbitrary CSS/colour rejection, unrelated-account denial and anonymous restriction');
end; $$;
select * from appearance_results;
rollback;
