begin;

create table if not exists public.event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 10 and 600),
  status text not null default 'open' check (status in ('open', 'answered', 'hidden')),
  answer_body text check (answer_body is null or char_length(trim(answer_body)) between 2 and 1200),
  answered_by uuid references auth.users(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_question_supports (
  question_id uuid not null references public.event_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create table if not exists public.event_question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.event_questions(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'privacy', 'spam', 'safety', 'other')),
  details text not null check (char_length(trim(details)) between 10 and 1000),
  evidence_snapshot jsonb not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_to uuid references auth.users(id) on delete set null,
  outcome text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, reporter_id)
);

create index if not exists event_questions_event_status_created_idx
  on public.event_questions(event_id, status, created_at);
create index if not exists event_question_reports_status_created_idx
  on public.event_question_reports(status, created_at);

alter table public.event_questions enable row level security;
alter table public.event_question_supports enable row level security;
alter table public.event_question_reports enable row level security;
revoke all on table public.event_questions from anon, authenticated;
revoke all on table public.event_question_supports from anon, authenticated;
revoke all on table public.event_question_reports from anon, authenticated;

create or replace function public.can_manage_event_questions(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (
    public.can_manage_event(p_event_id)
    or exists (
      select 1 from public.member_event_proposals proposal
      where proposal.canonical_event_id = p_event_id
        and proposal.proposed_by = p_user_id and proposal.status = 'approved'
    )
    or exists (
      select 1 from public.community_event_proposals proposal
      where proposal.canonical_event_id = p_event_id
        and proposal.proposed_by = p_user_id and proposal.status = 'approved'
    )
  );
$$;

create or replace function public.list_event_questions(p_event_id uuid)
returns table(
  question_id uuid, author_id uuid, author_name text, author_avatar_url text,
  body text, question_status text, answer_body text, answerer_name text,
  support_count bigint, supported_by_me boolean, can_manage boolean,
  created_at timestamptz, answered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) or not public.can_view_event(p_event_id) then
    raise exception 'Questions are available to active members';
  end if;
  return query
  select question.id, question.author_id, author.display_name, author.avatar_url,
    question.body, question.status, question.answer_body, answerer.display_name,
    (select count(*) from public.event_question_supports support where support.question_id = question.id),
    exists(select 1 from public.event_question_supports support where support.question_id = question.id and support.user_id = auth.uid()),
    public.can_manage_event_questions(p_event_id), question.created_at, question.answered_at
  from public.event_questions question
  join public.profiles author on author.id = question.author_id
  left join public.profiles answerer on answerer.id = question.answered_by
  where question.event_id = p_event_id
    and (question.status <> 'hidden' or question.author_id = auth.uid() or public.can_manage_event_questions(p_event_id))
    and (question.author_id = auth.uid() or not public.is_blocked_pair(auth.uid(), question.author_id))
  order by case question.status when 'open' then 0 when 'answered' then 1 else 2 end,
    (select count(*) from public.event_question_supports support where support.question_id = question.id) desc,
    question.created_at asc;
end;
$$;

create or replace function public.submit_event_question(p_event_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved uuid;
  clean_body text := trim(coalesce(p_body, ''));
  target public.events%rowtype;
  recipient uuid;
begin
  if not public.is_active_member(auth.uid()) or not public.can_view_event(p_event_id) then
    raise exception 'Questions are available to active members';
  end if;
  select * into target from public.events where id = p_event_id and status = 'published';
  if not found or target.ends_at < now() then raise exception 'Questions for this event are closed'; end if;
  if char_length(clean_body) not between 10 and 600 then
    raise exception 'Keep your question between 10 and 600 characters';
  end if;
  if (select count(*) from public.event_questions question where question.author_id = auth.uid() and question.created_at >= now() - interval '1 hour') >= 5 then
    raise exception 'You have reached the question limit for this hour';
  end if;
  insert into public.event_questions(event_id, author_id, body)
  values(p_event_id, auth.uid(), clean_body) returning id into saved;
  for recipient in
    select proposal.proposed_by from public.member_event_proposals proposal
      where proposal.canonical_event_id = p_event_id and proposal.status = 'approved'
    union
    select proposal.proposed_by from public.community_event_proposals proposal
      where proposal.canonical_event_id = p_event_id and proposal.status = 'approved'
    union
    select role.user_id from public.user_roles role where role.role = 'super_admin'
  loop
    if recipient <> auth.uid() then
      perform public.enqueue_notification(recipient, 'event', 'A member asked about your event',
        left(clean_body, 180), '/events/' || target.slug || '#questions',
        'event-question:' || saved::text || ':' || recipient::text);
    end if;
  end loop;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'event.question_created', 'event_question', saved, jsonb_build_object('event_id', p_event_id));
  return saved;
end;
$$;

create or replace function public.toggle_event_question_support(p_question_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare target public.event_questions%rowtype;
begin
  select * into target from public.event_questions where id = p_question_id;
  if not found or target.status = 'hidden' or not public.is_active_member(auth.uid())
    or not public.can_view_event(target.event_id)
    or (target.author_id <> auth.uid() and public.is_blocked_pair(auth.uid(), target.author_id)) then
    raise exception 'Question unavailable';
  end if;
  delete from public.event_question_supports where question_id = p_question_id and user_id = auth.uid();
  if found then return false; end if;
  insert into public.event_question_supports(question_id, user_id) values(p_question_id, auth.uid());
  return true;
end;
$$;

create or replace function public.answer_event_question(p_question_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target public.event_questions%rowtype; event_slug text; clean_answer text := trim(coalesce(p_answer, ''));
begin
  select * into target from public.event_questions where id = p_question_id for update;
  if not found or not public.can_manage_event_questions(target.event_id) then raise exception 'Host access required'; end if;
  if char_length(clean_answer) not between 2 and 1200 then raise exception 'Keep the answer between 2 and 1200 characters'; end if;
  update public.event_questions set status = 'answered', answer_body = clean_answer,
    answered_by = auth.uid(), answered_at = now(), updated_at = now() where id = target.id;
  select slug into event_slug from public.events where id = target.event_id;
  if target.author_id <> auth.uid() then
    perform public.enqueue_notification(target.author_id, 'event', 'Your event question was answered',
      left(clean_answer, 180), '/events/' || event_slug || '#questions', 'event-question-answered:' || target.id::text);
  end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'event.question_answered', 'event_question', target.id, jsonb_build_object('event_id', target.event_id));
end;
$$;

create or replace function public.hide_event_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target public.event_questions%rowtype;
begin
  select * into target from public.event_questions where id = p_question_id for update;
  if not found or not public.can_manage_event_questions(target.event_id) then raise exception 'Host access required'; end if;
  update public.event_questions set status = 'hidden', updated_at = now() where id = target.id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'event.question_hidden', 'event_question', target.id, jsonb_build_object('event_id', target.event_id));
end;
$$;

create or replace function public.report_event_question(p_question_id uuid, p_reason text, p_details text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target public.event_questions%rowtype; saved uuid; clean_details text := trim(coalesce(p_details, ''));
begin
  select * into target from public.event_questions where id = p_question_id;
  if not found or not public.is_active_member(auth.uid()) or not public.can_view_event(target.event_id) then raise exception 'Question unavailable'; end if;
  if target.author_id = auth.uid() then raise exception 'You cannot report your own question'; end if;
  if p_reason not in ('harassment', 'privacy', 'spam', 'safety', 'other') then raise exception 'Choose a report reason'; end if;
  if char_length(clean_details) not between 10 and 1000 then raise exception 'Tell us what happened in 10 to 1000 characters'; end if;
  insert into public.event_question_reports(question_id, reporter_id, reason, details, evidence_snapshot)
  values(target.id, auth.uid(), p_reason, clean_details, jsonb_build_object('body', target.body, 'author_id', target.author_id, 'event_id', target.event_id))
  on conflict(question_id, reporter_id) do update set reason = excluded.reason, details = excluded.details,
    evidence_snapshot = excluded.evidence_snapshot, status = 'open', updated_at = now()
  returning id into saved;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'event.question_reported', 'event_question_report', saved, jsonb_build_object('question_id', target.id, 'reason', p_reason));
  return saved;
end;
$$;

create or replace function public.list_event_question_reports()
returns table(
  report_id uuid, community_id uuid, community_name text, reporter_email text,
  category text, details text, evidence_snapshot jsonb, status text,
  created_at timestamptz, content_type text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin','moderator']::public.app_role[]) then
    raise exception 'Moderator access required';
  end if;
  return query
  select report.id, null::uuid, event.title, reporter.email::text,
    report.reason, report.details, report.evidence_snapshot, report.status,
    report.created_at, 'event_question'::text
  from public.event_question_reports report
  join public.event_questions question on question.id = report.question_id
  join public.events event on event.id = question.event_id
  join auth.users reporter on reporter.id = report.reporter_id
  order by case report.status when 'open' then 0 when 'reviewing' then 1 else 2 end,
    report.created_at desc;
end;
$$;

create or replace function public.review_event_question_report(
  p_report_id uuid,
  p_action text,
  p_outcome text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target public.event_question_reports%rowtype; clean_outcome text := nullif(trim(coalesce(p_outcome, '')), '');
begin
  if not public.is_admin(array['super_admin','moderator']::public.app_role[]) then raise exception 'Moderator access required'; end if;
  select * into target from public.event_question_reports where id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if p_action = 'start_review' then
    update public.event_question_reports set status = 'reviewing', assigned_to = auth.uid(), updated_at = now() where id = target.id;
  elsif p_action = 'hide' then
    if clean_outcome is null or char_length(clean_outcome) < 5 then raise exception 'Add a short moderation reason'; end if;
    update public.event_questions set status = 'hidden', updated_at = now() where id = target.question_id;
    update public.event_question_reports set status = 'resolved', assigned_to = auth.uid(), outcome = clean_outcome, reviewed_at = now(), updated_at = now() where id = target.id;
  elsif p_action = 'dismiss' then
    if clean_outcome is null or char_length(clean_outcome) < 5 then raise exception 'Add a short moderation reason'; end if;
    update public.event_question_reports set status = 'dismissed', assigned_to = auth.uid(), outcome = clean_outcome, reviewed_at = now(), updated_at = now() where id = target.id;
  else raise exception 'Choose start_review, hide or dismiss'; end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'event.question_report_' || p_action, 'event_question_report', target.id, jsonb_build_object('outcome', clean_outcome));
end;
$$;

revoke all on function public.can_manage_event_questions(uuid,uuid) from public;
grant execute on function public.can_manage_event_questions(uuid,uuid) to authenticated;
revoke all on function public.list_event_questions(uuid) from public;
grant execute on function public.list_event_questions(uuid) to authenticated;
revoke all on function public.submit_event_question(uuid,text) from public;
grant execute on function public.submit_event_question(uuid,text) to authenticated;
revoke all on function public.toggle_event_question_support(uuid) from public;
grant execute on function public.toggle_event_question_support(uuid) to authenticated;
revoke all on function public.answer_event_question(uuid,text) from public;
grant execute on function public.answer_event_question(uuid,text) to authenticated;
revoke all on function public.hide_event_question(uuid) from public;
grant execute on function public.hide_event_question(uuid) to authenticated;
revoke all on function public.report_event_question(uuid,text,text) from public;
grant execute on function public.report_event_question(uuid,text,text) to authenticated;
revoke all on function public.list_event_question_reports() from public;
grant execute on function public.list_event_question_reports() to authenticated;
revoke all on function public.review_event_question_report(uuid,text,text) from public;
grant execute on function public.review_event_question_report(uuid,text,text) to authenticated;

comment on table public.event_questions is 'Focused, moderated questions for approved event Hosts; not a general event social feed.';

commit;
