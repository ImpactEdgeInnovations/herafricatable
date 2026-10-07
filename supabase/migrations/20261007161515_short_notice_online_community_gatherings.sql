begin;

-- Patch the narrow timing/link checks, preserving current permissions, audit and
-- publication logic. Fail loudly on an unexpected function definition.
do $migration$
declare definition text; old_guard text; new_guard text; signature regprocedure;
begin
  signature := 'public.publish_community_gathering(uuid)'::regprocedure;
  definition := pg_get_functiondef(signature);
  old_guard := $old$if target.starts_at < now() + interval '24 hours' then
    raise exception 'Open the gathering at least 24 hours before it begins';
  end if;$old$;
  new_guard := $new$if target.format = 'virtual' and target.starts_at <= now() then
    raise exception 'Choose a future start time for your online gathering';
  end if;
  if target.format <> 'virtual' and target.starts_at < now() + interval '24 hours' then
    raise exception 'Open an in-person gathering at least 24 hours before it begins';
  end if;$new$;
  if position(old_guard in definition) > 0 then
    definition := replace(definition, old_guard, new_guard);
    definition := replace(definition, '  update public.community_event_proposals', $room$
  update public.community_gathering_rooms
  set meeting_url = nullif(trim(coalesce(target.online_url, '')), ''),
      meeting_provider = case
        when nullif(trim(coalesce(target.online_url, '')), '') is null then null
        when target.online_url ~* '^https://meet[.]google[.]com/' then 'google_meet'
        when target.online_url ~* '^https://([a-z0-9-]+[.])?zoom[.]us/' then 'zoom'
        else 'other' end,
      updated_by = actor, updated_at = now()
  where community_id = target.community_id and event_id = saved_event;

  update public.community_event_proposals$room$);
    execute definition;
  elsif position(new_guard in definition) = 0 then
    raise exception 'Unexpected gathering publication definition; migration not applied';
  end if;

  select oid::regprocedure into strict signature from pg_proc
  where pronamespace = 'public'::regnamespace and proname = 'save_community_event_proposal';
  definition := pg_get_functiondef(signature);
  old_guard := 'if coalesce(p_submit, false) and p_starts_at < now() + interval ''24 hours'' then';
  new_guard := 'if coalesce(p_submit, false) and p_format <> ''virtual'' and p_starts_at < now() + interval ''24 hours'' then';
  if position(old_guard in definition) > 0 then
    definition := replace(definition, old_guard, new_guard);
  elsif position(new_guard in definition) = 0 then
    raise exception 'Unexpected gathering save timing definition';
  end if;
  old_guard := 'if p_format in (''virtual'', ''hybrid'')' || chr(10) || '    and nullif(trim(coalesce(p_online_url, '''')), '''') is null then';
  new_guard := 'if p_format = ''hybrid''' || chr(10) || '    and nullif(trim(coalesce(p_online_url, '''')), '''') is null then';
  if position(old_guard in definition) > 0 then
    definition := replace(definition, old_guard, new_guard);
  elsif position(new_guard in definition) = 0 then
    raise exception 'Unexpected gathering link validation definition';
  end if;
  execute definition;
end;
$migration$;

-- No new functions/grants and no change to Community membership or public-event rules.
commit;
