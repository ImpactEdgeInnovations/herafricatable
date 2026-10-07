-- Rollback-only permission rehearsal. Not a migration; no messages are sent.
begin;
create temporary table connection_consent_results(result text);
do $$
declare a uuid; b uuid; pair_id uuid; conversation_id uuid; denied boolean;
begin
  select m.user_id into strict a from public.communities c join public.community_memberships m on m.community_id=c.id and m.role='owner' and m.status='active' where c.slug='lavington-women';
  select p.id into strict b from public.profiles p where p.id<>a and public.is_active_member(p.id)
    and not exists(select 1 from public.connections x where x.user_low=least(a,p.id) and x.user_high=greatest(a,p.id)) limit 1;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  insert into public.connections(user_low,user_high,requester_id,recipient_id,status) values(least(a,b),greatest(a,b),a,b,'pending') returning id into pair_id;
  denied:=false; begin perform public.ensure_conversation(pair_id); exception when others then denied:=true; end;
  if not denied then raise exception 'Pending connection could open private messaging'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.respond_to_connection(pair_id,'accept');
  conversation_id:=public.ensure_conversation(pair_id);
  if conversation_id is null then raise exception 'Accepted connection could not open messaging'; end if;
  if public.ensure_conversation(pair_id)<>conversation_id then raise exception 'Duplicate conversation on retry'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.block_member(b,'Rollback-only Community consent boundary test');
  denied:=false; begin perform public.ensure_conversation(pair_id); exception when others then denied:=true; end;
  if not denied then raise exception 'Blocking did not stop messaging'; end if;
  insert into connection_consent_results values('PASS: pending message denial, recipient acceptance, accepted messaging, retry-safe conversation and blocked-pair denial');
end; $$;
select * from connection_consent_results;
rollback;
