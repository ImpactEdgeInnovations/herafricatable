-- TEST ONLY. Tagged accounts, metadata-only fixtures and rollback; no Storage upload or email.
begin;
create temporary table album_cover_results(result text);
do $$
declare cid uuid; aid uuid:=gen_random_uuid(); other_album uuid:=gen_random_uuid(); host_id uuid; member_id uuid; other_id uuid; admin_id uuid;
 bid uuid; pid uuid; ids uuid[]:='{}'; page jsonb; page2 jsonb; page3 jsonb; denied boolean; foreign_photo uuid:=gen_random_uuid(); pending_photo uuid:=gen_random_uuid();
begin
 select c.id into strict cid from public.communities c where c.slug='hat-community-event-acceptance';
 select u.id into strict host_id from auth.users u join public.profiles p on p.id=u.id where u.email='community.host@hat-test.invalid' and p.is_test_account;
 select u.id into strict member_id from auth.users u join public.profiles p on p.id=u.id where u.email='community.member.one@hat-test.invalid' and p.is_test_account;
 select u.id into strict other_id from auth.users u join public.profiles p on p.id=u.id where u.email='community.member.two@hat-test.invalid' and p.is_test_account;
 select user_id into strict admin_id from public.user_roles where role='super_admin' and (expires_at is null or expires_at>now()) limit 1;
 if not exists(select 1 from public.community_memberships where community_id=cid and user_id=host_id and role='owner') then raise exception 'Tagged fixture owner mismatch';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 update public.community_release_checks set status='passed' where community_id=cid;
 update public.communities set status='published' where id=cid;
 insert into public.community_cohorts(community_id,eligibility_scope,status,welcome_message,introduction_prompt,created_by,follow_up_until)
 values(cid,'active_members','active','Rollback-only album rehearsal.','Rollback-only photo metadata.',host_id,now()+interval '1 day')
 on conflict(community_id) do update set status='active',follow_up_until=now()+interval '1 day';
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform public.create_community_photo_album(cid,aid,'[TEST] Album paging','Rollback-only fixture.');
 perform public.create_community_photo_album(cid,other_album,'[TEST] Other album','Rollback-only fixture.');
 for batch in 0..4 loop
  bid:=gen_random_uuid();
  insert into public.community_photo_batches(id,album_id,uploader_id,photo_count) values(bid,aid,host_id,10);
  for item in 1..10 loop
   pid:=gen_random_uuid();ids:=array_append(ids,pid);
   insert into public.community_album_photos(id,album_id,community_id,batch_id,uploader_id,status,stored_bytes,width,height,created_at,caption)
    values(pid,aid,cid,bid,case when batch=0 and item=1 then other_id else host_id end,'published',1000,120,80,now()+((batch*10+item)::text||' seconds')::interval,'Synthetic photo');
  end loop;
 end loop;
 bid:=gen_random_uuid();insert into public.community_photo_batches(id,album_id,uploader_id,photo_count)values(bid,aid,host_id,1);
 insert into public.community_album_photos(id,album_id,community_id,batch_id,uploader_id,status,stored_bytes,width,height)values(pending_photo,aid,cid,bid,host_id,'pending',1000,120,80);
 bid:=gen_random_uuid();insert into public.community_photo_batches(id,album_id,uploader_id,photo_count)values(bid,other_album,host_id,3);
 insert into public.community_album_photos(id,album_id,community_id,batch_id,uploader_id,status,stored_bytes,width,height)values(foreign_photo,other_album,cid,bid,host_id,'published',1000,120,80);
 insert into public.community_album_photos(album_id,community_id,batch_id,uploader_id,status,stored_bytes,width,height)
  select other_album,cid,bid,host_id,'published',1000,120,80 from generate_series(1,2);

 execute 'set local role authenticated';
 page:=public.get_community_photo_album_page(aid);
 if jsonb_array_length(page->'photos')<>24 or not (page->>'has_more')::boolean then raise exception 'First page not bounded';end if;
 if (page->'album'->>'cover_photo_id')::uuid<>ids[1] then raise exception 'Automatic cover missing';end if;
 page2:=public.get_community_photo_album_page(aid,(page->>'next_cursor')::uuid);
 page3:=public.get_community_photo_album_page(aid,(page2->>'next_cursor')::uuid);
 if jsonb_array_length(page2->'photos')<>24 or jsonb_array_length(page3->'photos')<>3 or (page3->>'has_more')::boolean then raise exception 'Paging did not cover all Host-visible rows';end if;
 if (select count(distinct photo->>'id') from jsonb_array_elements((page->'photos')||(page2->'photos')||(page3->'photos')) photo)<>51 then raise exception 'Duplicate/skipped page records';end if;
 page:=public.get_community_photo_album_page(other_album,null,1);
 page2:=public.get_community_photo_album_page(other_album,(page->>'next_cursor')::uuid,1);
 page3:=public.get_community_photo_album_page(other_album,(page2->>'next_cursor')::uuid,1);
 if (select count(distinct photo->>'id') from jsonb_array_elements((page->'photos')||(page2->'photos')||(page3->'photos')) photo)<>3 then raise exception 'Equal-time cursor records skipped or duplicated';end if;
 perform public.save_community_album_cover(aid,ids[50]);
 if (public.get_community_photo_album_page(aid)->'album'->>'cover_photo_id')::uuid<>ids[50] then raise exception 'Saved cover did not persist';end if;
 denied:=false;begin perform public.save_community_album_cover(aid,pending_photo);exception when raise_exception then denied:=true;end;if not denied then raise exception 'Pending photo chosen as cover';end if;
 denied:=false;begin perform public.save_community_album_cover(aid,foreign_photo);exception when raise_exception then denied:=true;end;if not denied then raise exception 'Cross-album cover accepted';end if;
 denied:=false;begin perform public.get_community_photo_album_page(aid,foreign_photo);exception when raise_exception then denied:=true;end;if not denied then raise exception 'Cross-album cursor accepted';end if;
 perform public.review_community_album_photo(ids[50],'hide');
 if (public.get_community_photo_album_page(aid)->'album'->>'cover_photo_id')::uuid<>ids[1] then raise exception 'Hidden cover did not fall back';end if;
 perform public.save_community_album_cover(aid,null);
 if coalesce((public.get_community_photo_album_page(aid)->'album'->>'cover_is_custom')::boolean,true) then raise exception 'Automatic reset not recorded';end if;
 perform public.save_community_album_cover(aid,ids[1]);
 execute 'reset role';

 insert into public.member_blocks(blocker_id,blocked_id) values(member_id,other_id) on conflict do nothing;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 execute 'set local role authenticated';
 page:=public.get_community_photo_album_page(aid,null,100);
 if exists(select 1 from jsonb_array_elements(page->'photos') p where (p->>'id')::uuid in(ids[1],ids[50],pending_photo)) then raise exception 'Member saw blocked, hidden or another pending photo';end if;
 if (page->'album'->>'cover_photo_id')::uuid=ids[1] then raise exception 'Blocked uploader became cover';end if;
 if exists(select 1 from jsonb_array_elements(public.list_community_photo_albums(cid)->'albums') a where a->>'id'=aid::text and (a->>'cover_photo_id')::uuid=ids[1]) then raise exception 'Album card leaked blocked cover';end if;
 denied:=false;begin perform public.save_community_album_cover(aid,ids[2]);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Ordinary member changed cover';end if;
 execute 'reset role';
 update public.community_album_photos set admin_hidden=true where id=ids[1];
 perform set_config('request.jwt.claim.sub',host_id::text,true);execute 'set local role authenticated';
 if (public.get_community_photo_album_page(aid)->'album'->>'cover_photo_id')::uuid=ids[1] then raise exception 'Safety-held cover remained visible';end if;
 execute 'reset role';
 update public.community_album_photos set admin_hidden=false where id=ids[1];
 update public.profiles set access_status='deleted' where id=other_id;
 execute 'set local role authenticated';
 if (public.get_community_photo_album_page(aid)->'album'->>'cover_photo_id')::uuid=ids[1] then raise exception 'Deleted uploader remained album cover';end if;
 perform public.save_community_album_cover(aid,ids[2]);
 perform public.review_community_album_photo(ids[2],'remove');
 if (public.get_community_photo_album_page(aid)->'album'->>'cover_photo_id')::uuid=ids[2] then raise exception 'Removed cover did not fall back';end if;
 execute 'reset role';
 delete from public.community_album_photos where id=ids[2];
 if (select cover_photo_id from public.community_photo_albums where id=aid) is not null then raise exception 'Deleted photo left a stale stored cover';end if;
 update public.profiles set access_status='active' where id=other_id;
 update public.community_memberships set status='removed' where community_id=cid and user_id=other_id;
 perform set_config('request.jwt.claim.sub',other_id::text,true);execute 'set local role authenticated';
 denied:=false;begin perform public.get_community_photo_album_page(aid);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Removed member could read photo page';end if;
 execute 'reset role';
 update public.community_memberships set status='suspended' where community_id=cid and user_id=host_id;
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 execute 'set local role authenticated';
 denied:=false;begin perform public.save_community_album_cover(aid,ids[2]);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Suspended Host changed cover';end if;
 execute 'reset role';
 if has_function_privilege('anon','public.get_community_photo_album_page(uuid,uuid,integer)','execute') or has_function_privilege('anon','public.save_community_album_cover(uuid,uuid)','execute') then raise exception 'Anonymous RPC grant';end if;
 insert into album_cover_results values('PASS: bounded/equal-time cursor pages, saved/automatic/fallback covers, pending/cross-album refusal, blocked/held/deleted/removed cover safety and member/removed-member/suspended-Host denial');
end;
$$;
select * from album_cover_results;
rollback;
