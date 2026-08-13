begin;

create table if not exists public.table_guide_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (
    category in ('getting_started', 'connections', 'communities', 'events', 'support', 'other')
  ),
  helpful boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.table_guide_suggestion_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (
    target_kind in ('community', 'event', 'member', 'page')
  ),
  target_key text not null check (char_length(target_key) between 1 and 200),
  relevant boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, target_kind, target_key)
);

create index if not exists table_guide_feedback_created_idx
  on public.table_guide_feedback (created_at desc);
create index if not exists table_guide_feedback_user_created_idx
  on public.table_guide_feedback (user_id, created_at desc);

alter table public.table_guide_feedback enable row level security;
alter table public.table_guide_suggestion_feedback enable row level security;

drop policy if exists "Members read own Table Guide feedback"
  on public.table_guide_feedback;
create policy "Members read own Table Guide feedback"
  on public.table_guide_feedback for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members read own Nia suggestion choices"
  on public.table_guide_suggestion_feedback;
create policy "Members read own Nia suggestion choices"
  on public.table_guide_suggestion_feedback for select to authenticated
  using (user_id = auth.uid());

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
    'getting_started', 'connections', 'communities', 'events', 'support', 'other'
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

create or replace function public.get_table_guide_feedback_admin()
returns table (
  feedback_7d bigint,
  helpful_7d bigint,
  not_helpful_7d bigint,
  helpful_percent_7d numeric,
  last_feedback_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;

  return query
  select
    count(*) filter (where feedback.created_at >= now() - interval '7 days'),
    count(*) filter (
      where feedback.helpful
        and feedback.created_at >= now() - interval '7 days'
    ),
    count(*) filter (
      where not feedback.helpful
        and feedback.created_at >= now() - interval '7 days'
    ),
    round(
      100.0 * count(*) filter (
        where feedback.helpful
          and feedback.created_at >= now() - interval '7 days'
      ) / nullif(
        count(*) filter (where feedback.created_at >= now() - interval '7 days'),
        0
      ),
      1
    ),
    max(feedback.created_at)
  from public.table_guide_feedback feedback;
end;
$$;

create or replace function public.save_table_guide_suggestion_feedback(
  p_target_kind text,
  p_target_key text,
  p_relevant boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_key text := left(trim(coalesce(p_target_key, '')), 200);
begin
  if actor is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = actor
      and profile.access_status in ('onboarding', 'active')
  ) then
    raise exception 'Approved membership required';
  end if;
  if p_target_kind not in ('community', 'event', 'member', 'page')
    or clean_key = '' then
    raise exception 'Unsupported Nia suggestion';
  end if;
  if not exists (
    select 1
    from public.table_guide_suggestion_feedback choice
    where choice.user_id = actor
      and choice.target_kind = p_target_kind
      and choice.target_key = clean_key
  ) and (
    select count(*)
    from public.table_guide_suggestion_feedback choice
    where choice.user_id = actor
  ) >= 500 then
    raise exception 'Suggestion choice limit reached';
  end if;

  insert into public.table_guide_suggestion_feedback (
    user_id, target_kind, target_key, relevant, updated_at
  ) values (
    actor, p_target_kind, clean_key, coalesce(p_relevant, false), now()
  )
  on conflict (user_id, target_kind, target_key) do update set
    relevant = excluded.relevant,
    updated_at = now();
end;
$$;

revoke all on function public.record_table_guide_feedback(text, boolean) from public;
grant execute on function public.record_table_guide_feedback(text, boolean) to authenticated;
revoke all on function public.get_table_guide_feedback_admin() from public;
grant execute on function public.get_table_guide_feedback_admin() to authenticated;
revoke all on function public.save_table_guide_suggestion_feedback(text, text, boolean) from public;
grant execute on function public.save_table_guide_suggestion_feedback(text, text, boolean) to authenticated;

comment on table public.table_guide_feedback is
  'Privacy-minimised usefulness choices. No member question, answer or result content is stored.';
comment on function public.record_table_guide_feedback(text, boolean) is
  'Records only a category and usefulness choice for an approved member, with a daily abuse limit.';
comment on table public.table_guide_suggestion_feedback is
  'Member-owned relevance choices for Nia result cards. It stores an entity key, never question or answer text.';

commit;
