begin;

-- Earlier invitation functions use gen_random_bytes() and digest() without a
-- schema. Supabase installs pgcrypto in extensions, while those functions pin
-- search_path to an empty string. Give only the trusted extensions schema to
-- these four SECURITY DEFINER functions so send, review, preview and claim
-- work in the hosted database as well as in isolated tests.
alter function public.create_table_invitation(text, uuid, text, text)
  set search_path = 'extensions';
alter function public.review_table_invitation(uuid, text, text)
  set search_path = 'extensions';
alter function public.preview_table_invitation(text)
  set search_path = 'extensions';
alter function public.claim_table_invitation(text)
  set search_path = 'extensions';
-- The after-event sender may already have been installed from the previous
-- version of 013, so repair its saved function configuration as well.
alter function public.invite_event_follow_up_guest(uuid, uuid)
  set search_path = 'extensions';

commit;
