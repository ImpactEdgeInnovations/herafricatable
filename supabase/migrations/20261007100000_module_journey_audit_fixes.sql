begin;
-- Ordered after the existing 09:00 joining-policy migration.

-- Preserve existing invitation validation and delivery, fixing only the stale
-- proposal foreign key. No change to who can invite or to review rules.
do $$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.create_table_invitation(text,uuid,text,text)'::regprocedure,
    'public.list_my_table_invitations(text,uuid)'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    execute replace(definition, 'proposal.event_id', 'proposal.canonical_event_id');
  end loop;
end;
$$;

-- Tagged rehearsal profiles must not leak into ordinary discovery, including
-- Nia and the personalised home screen which share these RPCs.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.list_member_directory(text,text,text,integer,integer)'::regprocedure);
  if definition not like '%not p.is_test_account%' then
    definition := replace(definition, 'p.id<>auth.uid()', 'p.id<>auth.uid() and not p.is_test_account');
    execute definition;
  end if;
  definition := pg_get_functiondef('public.list_consent_led_member_recommendations(integer)'::regprocedure);
  if definition not like '%not profile.is_test_account%' then
    definition := replace(definition, 'profile.id <> auth.uid()', 'profile.id <> auth.uid() and not profile.is_test_account');
    execute definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
