begin;
-- Normal moderation is a soft delete. Actual privacy deletion must still cascade.
alter table public.community_gathering_discussions drop constraint community_gathering_discussions_post_id_fkey;
alter table public.community_gathering_discussions add constraint community_gathering_discussions_post_id_fkey
  foreign key(post_id) references public.community_posts(id) on delete cascade;
commit;
