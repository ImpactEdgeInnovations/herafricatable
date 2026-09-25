begin;

alter table public.table_guide_usage
  drop constraint if exists table_guide_usage_category_check;
alter table public.table_guide_usage
  add constraint table_guide_usage_category_check check (
    category in ('getting_started', 'connections', 'communities', 'events', 'referrals', 'support', 'other')
  );

alter table public.table_guide_feedback
  drop constraint if exists table_guide_feedback_category_check;
alter table public.table_guide_feedback
  add constraint table_guide_feedback_category_check check (
    category in ('getting_started', 'connections', 'communities', 'events', 'referrals', 'support', 'other')
  );

create or replace function public.record_table_guide_usage(
  p_status text,
  p_category text,
  p_prompt_chars integer,
  p_response_chars integer,
  p_model text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor and profile.access_status in ('onboarding', 'active')
  ) then
    raise exception 'Approved membership required';
  end if;
  if p_status not in ('success', 'refused', 'error', 'handoff') then
    raise exception 'Unsupported Table Guide status';
  end if;
  if p_category not in ('getting_started', 'connections', 'communities', 'events', 'referrals', 'support', 'other') then
    raise exception 'Unsupported Table Guide category';
  end if;

  insert into public.table_guide_usage (
    user_id, status, category, prompt_chars, response_chars, model
  ) values (
    actor,
    p_status,
    p_category,
    least(greatest(coalesce(p_prompt_chars, 0), 0), 2000),
    least(greatest(coalesce(p_response_chars, 0), 0), 5000),
    nullif(left(trim(coalesce(p_model, '')), 100), '')
  );
end;
$$;

create or replace function public.record_table_guide_feedback(
  p_category text,
  p_helpful boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = actor
      and profile.access_status in ('onboarding', 'active')
  ) then
    raise exception 'Approved membership required';
  end if;
  if not public.table_guide_enabled() then
    raise exception 'Table Guide is not available';
  end if;
  if p_category not in (
    'getting_started', 'connections', 'communities', 'events', 'referrals', 'support', 'other'
  ) then
    raise exception 'Unsupported Table Guide category';
  end if;
  if (
    select count(*)
    from public.table_guide_feedback feedback
    where feedback.user_id = actor
      and feedback.created_at >= now() - interval '24 hours'
  ) >= 40 then
    raise exception 'Feedback limit reached';
  end if;

  insert into public.table_guide_feedback (user_id, category, helpful)
  values (actor, p_category, coalesce(p_helpful, false));
end;
$$;

commit;
