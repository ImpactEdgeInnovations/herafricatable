begin;

-- Version aligned with the applied live migration history.

create or replace function public.get_repeat_event_auto_publish_setting()
returns boolean language sql stable security definer set search_path='' as $$
 select public.get_pilot_free_event_setting() and
  (select count(*) from public.member_event_proposals where proposed_by=auth.uid() and pilot_auto_draft)<2;
$$;
revoke all on function public.get_repeat_event_auto_publish_setting() from public,anon;
grant execute on function public.get_repeat_event_auto_publish_setting() to authenticated;

-- Keep the pilot limit. Extra repeat dates enter the existing Admin review
-- queue instead of failing the whole submission at the automatic-publish cap.
do $$
declare definition text;target text:='  if public.get_pilot_free_event_setting() then';
 extra text:='  if exists (select 1 from public.event_repeat_plans repeat_plan where repeat_plan.created_by = actor and repeat_plan.proposal_ids @> array[new.id]) and (select count(*) from public.member_event_proposals where proposed_by = actor and pilot_auto_draft) >= 2 then return new; end if;';
begin
 select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='create_invited_pilot_event_draft';
 if strpos(definition,target)=0 then raise exception 'Expected pilot publication branch was not found';end if;
 if strpos(definition,extra)=0 then execute replace(definition,target,extra||E'\n'||target);end if;
end;$$;

commit;
