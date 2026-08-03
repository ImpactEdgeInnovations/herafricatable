begin;

create or replace function public.search_my_table(
  p_query text,
  p_limit integer default 30
)
returns table (
  result_type text,
  result_id uuid,
  title text,
  subtitle text,
  excerpt text,
  href text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_query text := lower(trim(coalesce(p_query, '')));
  pattern text;
begin
  if not public.is_active_member(actor) then
    raise exception 'Active membership required';
  end if;
  if char_length(clean_query) not between 2 and 80 then
    raise exception 'Search must be between 2 and 80 characters';
  end if;
  pattern := '%' || clean_query || '%';

  return query
  with search_results as (
    select
      'member'::text as result_type,
      profile.id as result_id,
      profile.display_name as title,
      concat_ws(' · ', nullif(profile.job_title, ''), nullif(profile.company, '')) as subtitle,
      concat_ws(' · ', nullif(profile.industry, ''), nullif(profile.country, '')) as excerpt,
      '/members/' || profile.id::text as href,
      profile.updated_at as occurred_at,
      case
        when lower(profile.display_name) = clean_query then 100
        when lower(profile.display_name) like clean_query || '%' then 90
        else 65
      end as relevance
    from public.profiles profile
    where profile.access_status = 'active'
      and not profile.visibility_paused
      and profile.id <> actor
      and not public.is_blocked_pair(actor, profile.id)
      and lower(concat_ws(' ',
        profile.display_name,
        profile.job_title,
        profile.company,
        profile.industry,
        profile.country
      )) like pattern

    union all

    select
      'community'::text,
      community.id,
      community.name,
      'Community',
      left(community.description, 180),
      '/communities/' || community.slug,
      community.updated_at,
      case
        when lower(community.name) = clean_query then 98
        when lower(community.name) like clean_query || '%' then 88
        else 60
      end
    from public.communities community
    join public.community_memberships membership
      on membership.community_id = community.id
     and membership.user_id = actor
     and membership.status = 'active'
    where public.communities_enabled()
      and community.status = 'published'
      and lower(concat_ws(' ', community.name, community.description)) like pattern

    union all

    select
      'conversation'::text,
      post.id,
      creator.display_name,
      community.name || ' · ' || replace(post.category, '_', ' '),
      left(post.body, 220),
      '/communities/' || community.slug || '#conversation-' || post.id::text,
      post.created_at,
      case when lower(post.body) like clean_query || '%' then 76 else 58 end
    from public.community_posts post
    join public.communities community on community.id = post.community_id
    join public.community_memberships membership
      on membership.community_id = post.community_id
     and membership.user_id = actor
     and membership.status = 'active'
    join public.profiles creator on creator.id = post.author_id
    where public.communities_enabled()
      and post.parent_post_id is null
      and post.status = 'published'
      and community.status = 'published'
      and creator.access_status = 'active'
      and not public.is_blocked_pair(actor, post.author_id)
      and lower(concat_ws(' ', post.body, creator.display_name, post.category, community.name)) like pattern

    union all

    select
      'event'::text,
      event.id,
      event.title,
      concat_ws(' · ', replace(event.format, '_', ' '), venue.city),
      left(coalesce(event.summary, 'View event details and registration.'), 180),
      '/events/' || event.slug,
      event.starts_at,
      case
        when lower(event.title) = clean_query then 96
        when lower(event.title) like clean_query || '%' then 86
        else 55
      end
    from public.events event
    left join public.venues venue on venue.id = event.venue_id
    where event.status = 'published'
      and event.ends_at >= now() - interval '1 year'
      and lower(concat_ws(' ', event.title, event.summary, event.format, venue.name, venue.city, venue.country)) like pattern

    union all

    select
      'learning'::text,
      course.id,
      course.title,
      'Learning · ' || course.instructor_name,
      left(course.summary, 180),
      '/learning/' || course.slug,
      course.created_at,
      case
        when lower(course.title) = clean_query then 94
        when lower(course.title) like clean_query || '%' then 84
        else 54
      end
    from public.courses course
    where public.learning_enabled()
      and course.status = 'published'
      and lower(concat_ws(' ', course.title, course.summary, course.instructor_name)) like pattern
  )
  select
    search_results.result_type,
    search_results.result_id,
    search_results.title,
    nullif(search_results.subtitle, ''),
    nullif(search_results.excerpt, ''),
    search_results.href,
    search_results.occurred_at
  from search_results
  order by search_results.relevance desc, search_results.occurred_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 40);
end;
$$;

revoke all on function public.search_my_table(text, integer) from public;
grant execute on function public.search_my_table(text, integer) to authenticated;

commit;
