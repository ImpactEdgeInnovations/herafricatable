begin;
-- Final consistency fixes, including the invitation-only admission policy.

create or replace function public.founding_pilot_real_member_count()
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from public.community_pilot_access access
    join public.profiles profile on profile.id=access.user_id where not profile.is_test_account;
$$;
revoke all on function public.founding_pilot_real_member_count() from public, anon, authenticated;

do $$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.assign_founding_community_pilot_access()'::regprocedure,
    'public.get_community_pilot_admin()'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    definition := replace(definition,'select count(*) from public.community_pilot_access','select public.founding_pilot_real_member_count()');
    -- Cohort allocation is independent of the Community opening toggle.
    definition := replace(definition,'where setting.id = true and setting.enabled for update','where setting.id = true for update');
    execute definition;
  end loop;
  definition := pg_get_functiondef('public.create_founding_community_pilot_draft()'::regprocedure);
  definition := replace(definition, 'Your private Community is ready', 'Your Community is ready');
  definition := replace(definition, 'Open your Community to prepare it. Members cannot join until the public launch checks pass.', 'Open your Community to welcome members and see its joining settings.');
  execute definition;
  definition := pg_get_functiondef('public.request_community_access(uuid)'::regprocedure);
  definition := replace(definition,
    'if target.join_policy = ''invite_only'' then',
    'if target.join_policy = ''invite_only'' and not exists (
      select 1 from public.table_invitations invitation
      join auth.users account on lower(account.email)=invitation.invitee_email and account.id=actor
      where invitation.community_id=p_community_id and invitation.destination_type=''community''
        and invitation.status in (''sent'',''opened'',''membership_pending'',''claimed'')
        and invitation.expires_at>now()
        and public.can_manage_community(p_community_id,invitation.inviter_id)
        and not exists (select 1 from public.community_memberships blocked
          where blocked.community_id=p_community_id and blocked.user_id=actor
            and blocked.status in (''removed'',''declined'') and blocked.updated_at>=invitation.sent_at)
    ) then');
  execute definition;
end;
$$;

notify pgrst, 'reload schema';
commit;
