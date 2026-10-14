begin;

-- Version aligned with the applied live migration history.

create index event_repeat_plans_proposals_idx on public.event_repeat_plans using gin(proposal_ids);
-- Change only the pending-draft count in the two existing save functions.
-- Keep their field checks, review/pilot rules, grants and publication behaviour.
do $$
declare target text:='and proposal.status in (''draft'', ''submitted'', ''under_review'', ''changes_requested'')';
 extra text:=' and not exists (select 1 from public.event_repeat_plans repeat_plan where repeat_plan.created_by = actor and repeat_plan.proposal_ids @> array[proposal.id])';
 definition text;item record;seen integer:=0;
begin
 for item in select oid from pg_proc where pronamespace='public'::regnamespace and proname in('save_member_event_proposal','save_community_event_proposal') loop
  definition:=pg_get_functiondef(item.oid);
  if strpos(definition,target)=0 then raise exception 'Expected event draft count was not found';end if;
  if strpos(definition,extra)=0 then execute replace(definition,target,target||extra);end if;
  seen:=seen+1;
 end loop;
 if seen<>2 then raise exception 'Expected both event draft save functions';end if;
end;$$;

commit;
