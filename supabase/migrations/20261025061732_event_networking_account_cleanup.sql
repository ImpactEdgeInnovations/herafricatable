begin;
-- Do not introduce new blockers to the existing privacy/offboarding workflow.
alter table hat_networking.sessions alter column updated_by drop not null;
alter table hat_networking.sessions drop constraint sessions_updated_by_fkey,
  add constraint sessions_updated_by_fkey foreign key(updated_by) references auth.users(id) on delete set null;
alter table hat_networking.actions alter column actor_id drop not null;
alter table hat_networking.actions drop constraint actions_actor_id_fkey,
  add constraint actions_actor_id_fkey foreign key(actor_id) references auth.users(id) on delete set null;
alter table hat_networking.matches drop constraint matches_member_a_fkey,
  drop constraint matches_member_b_fkey,
  add constraint matches_member_a_fkey foreign key(member_a) references auth.users(id) on delete cascade,
  add constraint matches_member_b_fkey foreign key(member_b) references auth.users(id) on delete cascade;
alter table hat_networking.help_requests drop constraint help_requests_user_id_fkey,
  add constraint help_requests_user_id_fkey foreign key(user_id) references auth.users(id) on delete cascade;
commit;
