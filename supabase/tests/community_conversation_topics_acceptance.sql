-- TEST ONLY. Every temporary setting/post/audit event is rolled back.
begin;
do $$
declare
  fixture record;
  member_id uuid;
  saved text[];
  rejected boolean;
  post_id uuid;
begin
  select c.id as community_id,m.user_id into fixture
  from public.communities c join public.community_memberships m on m.community_id=c.id
    join public.profiles p on p.id=m.user_id
  where p.is_test_account=true and p.access_status='active' and m.status='active'
    and m.role='owner' and c.status in ('draft','published')
  order by c.created_at desc limit 1;
  if fixture is null then raise exception 'A tagged test Host Community is required'; end if;
  select m.user_id into member_id from public.community_memberships m join public.profiles p on p.id=m.user_id
    where m.community_id=fixture.community_id and m.status='active' and m.role='member'
      and p.is_test_account=true and p.access_status='active' order by m.created_at limit 1;
  if member_id is null then raise exception 'A tagged ordinary test member is required'; end if;

  perform set_config('request.jwt.claim.sub',fixture.user_id::text,true);
  saved:=public.set_community_conversation_topics(fixture.community_id,array['resource','discussion','resource']);
  if saved<>array['discussion','resource'] then raise exception 'Topics were not normalized'; end if;
  if public.get_community_conversation_topics(fixture.community_id)<>saved then raise exception 'Saved topics did not persist'; end if;
  rejected:=false;
  begin perform public.set_community_conversation_topics(fixture.community_id,array[]::text[]);
    exception when others then if sqlerrm='Choose at least one supported topic' then rejected:=true; else raise; end if;
  end;
  if not rejected then raise exception 'Empty topics should fail'; end if;

  perform set_config('request.jwt.claim.sub',member_id::text,true);
  if public.get_community_conversation_topics(fixture.community_id)<>saved then raise exception 'Member cannot read topics'; end if;
  rejected:=false;
  begin perform public.set_community_conversation_topics(fixture.community_id,array['discussion']);
    exception when others then if sqlerrm='Community Host or moderator required' then rejected:=true; else raise; end if;
  end;
  if not rejected then raise exception 'Ordinary member changed Host topics'; end if;

  rejected:=false;
  begin perform public.create_structured_community_post(fixture.community_id,'[TEST] This transaction will roll back.','win');
    exception when others then if sqlerrm='This topic is closed for new conversations. Choose another topic.' then rejected:=true; else raise; end if;
  end;
  if not rejected then raise exception 'Closed topic accepted a new post'; end if;
  post_id:=public.create_structured_community_post(fixture.community_id,'[TEST] Allowed topic; this transaction will roll back.','resource');
  if not exists(select 1 from public.community_posts p where p.id=post_id and p.category='resource') then raise exception 'Allowed topic failed'; end if;

  perform set_config('request.jwt.claim.sub',fixture.user_id::text,true);
  perform public.set_community_conversation_topics(fixture.community_id,array['discussion']);
  if not exists(select 1 from public.community_posts p where p.id=post_id and p.category='resource') then raise exception 'Existing conversation was removed'; end if;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform public.create_community_comment(post_id,'[TEST] Existing replies remain open.');
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
  rejected:=false;
  begin perform public.get_community_conversation_topics(fixture.community_id);
    exception when others then if sqlerrm='Active community membership required' then rejected:=true; else raise; end if;
  end;
  if not rejected then raise exception 'Nonmember read private settings'; end if;
  if has_table_privilege('authenticated','public.community_conversation_topic_settings','SELECT')
    or has_function_privilege('anon','public.set_community_conversation_topics(uuid,text[])','EXECUTE') then
    raise exception 'Topic configuration privileges are too broad';
  end if;
end;
$$;
select 'passed: Host save/read, normalized choices, ordinary-member denial, closed-topic rejection, allowed post, retained conversation/replies, nonmember denial and private grants' as acceptance;
rollback;
