-- Rollback-only search/permission rehearsal; not a migration.
begin;
create temporary table community_search_results(result text);
do $$
declare cid uuid:='9acb54bc-6d61-45af-b7ca-86249d87de28';
 member_id uuid:='9b4cde5d-578e-442f-b9ee-2e304e88ae46'; host_id uuid:='86829233-6deb-4335-8370-468d61dce51e';
 token text:='search-'||gen_random_uuid()::text; cursor_record record; first_ids uuid[]; next_ids uuid[]; denied boolean;
begin
 perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
 update public.community_release_checks set status='passed' where community_id=cid;
 update public.communities set status='published' where id=cid;
 insert into public.community_posts(community_id,author_id,body,category,status,created_at)
 select cid,host_id,token||' opportunity '||n,'opportunity','published',now()-n*interval '1 minute'
 from generate_series(1,45) n;
 insert into public.community_posts(community_id,author_id,body,category,status,created_at)
 values(cid,host_id,token||' hidden opportunity','opportunity','hidden',now()),
  (cid,host_id,token||' discussion 100% literal','discussion','published',now());
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 select array_agg(p.post_id) into first_ids from public.search_community_conversation_page(cid,null,null,null,21,'opportunity',token,'all') p;
 if cardinality(first_ids)<>21 then raise exception 'Topic search missing older matching conversations'; end if;
 select * into cursor_record from public.search_community_conversation_page(cid,null,null,null,20,'opportunity',token,'all') p
 order by p.cursor_activity_at,p.post_id limit 1;
 select array_agg(p.post_id) into next_ids from public.search_community_conversation_page(cid,cursor_record.is_pinned,cursor_record.cursor_activity_at,cursor_record.post_id,25,'opportunity',token,'all') p;
 if cardinality(next_ids)<>25 or (select count(*) from unnest(next_ids) id where id=any(first_ids))<>1 then raise exception 'Cursor page skipped or duplicated records'; end if;
 if (select count(*) from public.search_community_conversation_page(cid,null,null,null,25,null,token||' hidden','all'))<>0 then raise exception 'Hidden conversation leaked'; end if;
 if (select count(*) from public.search_community_conversation_page(cid,null,null,null,25,null,'100% literal','all'))<>1 then raise exception 'Literal search failed'; end if;
 if (select count(*) from public.search_community_conversation_page(cid,null,null,null,25,null,token,'mine'))<>0 then raise exception 'Mine view included another author'; end if;
 insert into public.community_saved_posts(post_id,user_id) values(first_ids[1],member_id);
 if (select count(*) from public.search_community_conversation_page(cid,null,null,null,25,null,token,'saved'))<>1 then raise exception 'Saved search scope incorrect'; end if;
 insert into public.member_blocks(blocker_id,blocked_id) values(member_id,host_id) on conflict do nothing;
 if (select count(*) from public.search_community_conversation_page(cid,null,null,null,25,null,token,'all'))<>0 then raise exception 'Blocked author leaked'; end if;
 delete from public.member_blocks where blocker_id=member_id and blocked_id=host_id;
 update public.communities set status='archived' where id=cid;
 denied:=false; begin perform public.search_community_conversation_page(cid); exception when others then denied:=true; end;
 if not denied then raise exception 'Archived Community searchable'; end if;
 update public.communities set status='published' where id=cid;
 perform set_config('request.jwt.claim.sub','8beb9661-20b6-407e-b5e8-66d2bfb266b3',true);
 denied:=false; begin perform public.search_community_conversation_page(cid); exception when others then denied:=true; end;
 if not denied then raise exception 'Outsider searched Community'; end if;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 denied:=false; begin perform public.search_community_conversation_page(cid,p_search=>repeat('a',121)); exception when others then denied:=true; end;
 if not denied then raise exception 'Oversized search accepted'; end if;
 if has_function_privilege('anon','public.search_community_conversation_page(uuid,boolean,timestamptz,uuid,integer,text,text,text)','execute') then raise exception 'Anonymous search endpoint exposed'; end if;
 insert into community_search_results values('PASS: 45 matching posts, keyset pages, literal search, hidden/blocked filtering, mine/saved views, archived/outsider denial, bounded input and anonymous grants');
end;
$$;
select * from community_search_results;
rollback;
