begin;

-- Failed provider calls and human handoffs must not consume a member's daily
-- answer allowance. Only delivered or safely refused answers count.
create or replace function public.get_my_table_guide_access()
returns table (
  feature_enabled boolean,
  assistant_enabled boolean,
  recommend_me boolean,
  uses_today bigint,
  remaining_today integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  access_status public.member_access_status;
  usage_count bigint := 0;
begin
  select profile.access_status into access_status
  from public.profiles profile
  where profile.id = actor;

  if actor is null or access_status not in ('onboarding', 'active') then
    raise exception 'Approved membership required';
  end if;

  select count(*) into usage_count
  from public.table_guide_usage usage
  where usage.user_id = actor
    and usage.status in ('success', 'refused')
    and usage.created_at >= date_trunc('day', now());

  return query
  select
    public.table_guide_enabled(),
    coalesce(preference.assistant_enabled, false),
    coalesce(preference.recommend_me, false),
    usage_count,
    greatest(60 - usage_count, 0)::integer
  from (select 1) seed
  left join public.member_ai_preferences preference on preference.user_id = actor;
end;
$$;

revoke all on function public.get_my_table_guide_access() from public;
grant execute on function public.get_my_table_guide_access() to authenticated;

comment on function public.get_my_table_guide_access() is
  'Returns consent and quota state. Failed provider calls and human handoffs do not consume the daily answer allowance.';

commit;
