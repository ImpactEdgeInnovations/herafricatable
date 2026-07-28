begin;

create or replace function public.get_connection_outcome_summary(
  p_days integer default 365
)
returns table (
  outcome_type text,
  outcome_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  return query
  select outcome.outcome_type, count(*)::bigint
  from public.connection_outcomes outcome
  join public.connections connection on connection.id = outcome.connection_id
  join public.profiles owner_profile on owner_profile.id = outcome.owner_id
  join public.profiles low_profile on low_profile.id = connection.user_low
  join public.profiles high_profile on high_profile.id = connection.user_high
  where outcome.share_anonymously
    and outcome.occurred_on >= current_date
      - least(greatest(coalesce(p_days, 365), 1), 730)
    and not owner_profile.is_test_account
    and not low_profile.is_test_account
    and not high_profile.is_test_account
  group by outcome.outcome_type
  having count(distinct outcome.owner_id) >= 3
  order by count(*) desc, outcome.outcome_type;
end;
$$;

revoke all on function public.get_connection_outcome_summary(integer) from public;
grant execute on function public.get_connection_outcome_summary(integer) to authenticated;

commit;
