begin;

create or replace function public.list_member_recommendations(
  p_limit integer default 6
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  industry text,
  country text,
  city text,
  bio text,
  shared_goals text[],
  shared_interests text[],
  match_reasons text[],
  match_score integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active visible membership required';
  end if;

  return query
  with actor_profile as (
    select profile.city, profile.industry
    from public.profiles profile
    where profile.id = auth.uid()
  ),
  candidate_context as (
    select
      profile.id,
      profile.display_name,
      profile.avatar_url,
      profile.job_title,
      profile.company,
      profile.industry,
      profile.country,
      profile.city,
      profile.bio,
      array(
        select candidate_goal.goal_key
        from public.member_goals candidate_goal
        join public.member_goals actor_goal
          on actor_goal.user_id = auth.uid()
          and actor_goal.goal_key = candidate_goal.goal_key
        where candidate_goal.user_id = profile.id
        order by candidate_goal.goal_key
      ) as shared_goals,
      array(
        select candidate_interest.interest
        from public.profile_interests candidate_interest
        join public.profile_interests actor_interest
          on actor_interest.user_id = auth.uid()
          and lower(actor_interest.interest) = lower(candidate_interest.interest)
        where candidate_interest.user_id = profile.id
        order by candidate_interest.interest
      ) as shared_interests,
      actor.city as actor_city,
      actor.industry as actor_industry
    from public.profiles profile
    cross join actor_profile actor
    where profile.id <> auth.uid()
      and profile.access_status = 'active'
      and not profile.visibility_paused
      and not public.is_blocked_pair(auth.uid(), profile.id)
      and not exists (
        select 1
        from public.connections connection
        where connection.user_low = least(auth.uid(), profile.id)
          and connection.user_high = greatest(auth.uid(), profile.id)
          and connection.status in ('pending', 'accepted')
      )
      and not exists (
        select 1
        from public.member_saved_profiles saved
        where saved.saver_id = auth.uid()
          and saved.saved_user_id = profile.id
      )
  ),
  scored as (
    select
      candidate.*,
      (
        cardinality(candidate.shared_goals) * 5
        + cardinality(candidate.shared_interests) * 3
        + case
            when nullif(trim(candidate.city), '') is not null
              and lower(candidate.city) = lower(candidate.actor_city)
            then 2 else 0
          end
        + case
            when nullif(trim(candidate.industry), '') is not null
              and lower(candidate.industry) = lower(candidate.actor_industry)
            then 2 else 0
          end
      )::integer as score
    from candidate_context candidate
  )
  select
    scored.id,
    scored.display_name,
    scored.avatar_url,
    scored.job_title,
    scored.company,
    scored.industry,
    scored.country,
    scored.city,
    scored.bio,
    scored.shared_goals,
    scored.shared_interests,
    case
      when scored.score = 0 then array['A new perspective for your network']::text[]
      else array_remove(array[
        case
          when cardinality(scored.shared_goals) > 0
          then cardinality(scored.shared_goals)::text
            || case when cardinality(scored.shared_goals) = 1
              then ' shared goal' else ' shared goals' end
        end,
        case
          when cardinality(scored.shared_interests) > 0
          then cardinality(scored.shared_interests)::text
            || case when cardinality(scored.shared_interests) = 1
              then ' shared interest' else ' shared interests' end
        end,
        case
          when nullif(trim(scored.city), '') is not null
            and lower(scored.city) = lower(scored.actor_city)
          then 'Also in ' || scored.city
        end,
        case
          when nullif(trim(scored.industry), '') is not null
            and lower(scored.industry) = lower(scored.actor_industry)
          then 'Works in ' || scored.industry
        end
      ], null)::text[]
    end,
    scored.score
  from scored
  order by scored.score desc, scored.display_name nulls last, scored.id
  limit least(greatest(coalesce(p_limit, 6), 1), 12);
end;
$$;

revoke all on function public.list_member_recommendations(integer) from public;
grant execute on function public.list_member_recommendations(integer) to authenticated;

commit;
