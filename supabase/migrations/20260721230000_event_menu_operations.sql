create table public.event_menus (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  title text not null default 'At the Table',
  introduction text,
  embassy_note text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_courses (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.event_menus(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_id, name)
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.menu_courses(id) on delete cascade,
  name text not null,
  description text,
  cultural_origin text,
  cultural_story text,
  ingredients text[] not null default array[]::text[],
  dietary_tags text[] not null default array[]::text[],
  allergen_notes text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_item_feedback (
  item_id uuid not null references public.menu_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  is_favorite boolean not null default false,
  comment text check (char_length(comment) <= 800),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'hidden')),
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, user_id),
  constraint menu_feedback_has_value check (rating is not null or is_favorite or nullif(trim(comment), '') is not null)
);

create index menu_courses_menu_sort_idx on public.menu_courses(menu_id, sort_order);
create index menu_items_course_sort_idx on public.menu_items(course_id, sort_order);
create index menu_feedback_moderation_idx on public.menu_item_feedback(moderation_status, created_at);

alter table public.event_menus enable row level security;
alter table public.menu_courses enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_item_feedback enable row level security;

create policy "Anyone can read published event menus"
  on public.event_menus for select to anon, authenticated
  using (status = 'published' and exists (
    select 1 from public.events where events.id = event_menus.event_id and events.status = 'published'
  ));
create policy "Event admins manage menus"
  on public.event_menus for all to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "Anyone can read published menu courses"
  on public.menu_courses for select to anon, authenticated
  using (exists (
    select 1 from public.event_menus join public.events on events.id = event_menus.event_id
    where event_menus.id = menu_courses.menu_id and event_menus.status = 'published' and events.status = 'published'
  ));
create policy "Event admins manage menu courses"
  on public.menu_courses for all to authenticated
  using (exists (select 1 from public.event_menus where event_menus.id = menu_courses.menu_id and public.can_manage_event(event_menus.event_id)))
  with check (exists (select 1 from public.event_menus where event_menus.id = menu_courses.menu_id and public.can_manage_event(event_menus.event_id)));

create policy "Anyone can read published menu items"
  on public.menu_items for select to anon, authenticated
  using (status = 'published' and exists (
    select 1 from public.menu_courses
    join public.event_menus on event_menus.id = menu_courses.menu_id
    join public.events on events.id = event_menus.event_id
    where menu_courses.id = menu_items.course_id and event_menus.status = 'published' and events.status = 'published'
  ));
create policy "Event admins manage menu items"
  on public.menu_items for all to authenticated
  using (exists (
    select 1 from public.menu_courses join public.event_menus on event_menus.id = menu_courses.menu_id
    where menu_courses.id = menu_items.course_id and public.can_manage_event(event_menus.event_id)
  )) with check (exists (
    select 1 from public.menu_courses join public.event_menus on event_menus.id = menu_courses.menu_id
    where menu_courses.id = menu_items.course_id and public.can_manage_event(event_menus.event_id)
  ));

create policy "Members read their menu feedback"
  on public.menu_item_feedback for select to authenticated using (user_id = auth.uid());
create policy "Event admins read menu feedback"
  on public.menu_item_feedback for select to authenticated using (exists (
    select 1 from public.menu_items
    join public.menu_courses on menu_courses.id = menu_items.course_id
    join public.event_menus on event_menus.id = menu_courses.menu_id
    where menu_items.id = menu_item_feedback.item_id and public.can_manage_event(event_menus.event_id)
  ));

create or replace function public.save_event_menu(
  p_event_id uuid,
  p_title text,
  p_introduction text,
  p_embassy_note text,
  p_status text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); saved_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'You are not authorized to manage this event'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Menu title is required'; end if;
  if p_status not in ('draft', 'published', 'archived') then raise exception 'Unsupported menu status'; end if;
  if p_status = 'published' and nullif(trim(p_introduction), '') is null then
    raise exception 'Add a menu introduction before publishing';
  end if;

  insert into public.event_menus (event_id, title, introduction, embassy_note, status, published_at)
  values (p_event_id, trim(p_title), nullif(trim(p_introduction), ''), nullif(trim(p_embassy_note), ''), p_status,
    case when p_status = 'published' then now() else null end)
  on conflict (event_id) do update set
    title = excluded.title, introduction = excluded.introduction, embassy_note = excluded.embassy_note,
    status = excluded.status,
    published_at = case when excluded.status = 'published' then coalesce(event_menus.published_at, now()) else event_menus.published_at end,
    updated_at = now()
  returning id into saved_id;

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (actor_id, 'event.menu_saved', 'event_menu', saved_id, jsonb_build_object('event_id', p_event_id, 'status', p_status));
  return saved_id;
end; $$;

create or replace function public.save_menu_item(
  p_item_id uuid,
  p_event_id uuid,
  p_course_name text,
  p_course_description text,
  p_course_sort_order integer,
  p_name text,
  p_description text,
  p_cultural_origin text,
  p_cultural_story text,
  p_ingredients text[],
  p_dietary_tags text[],
  p_allergen_notes text,
  p_status text,
  p_sort_order integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); saved_menu_id uuid; saved_course_id uuid; saved_item_id uuid := p_item_id;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'You are not authorized to manage this event'; end if;
  select id into saved_menu_id from public.event_menus where event_id = p_event_id;
  if saved_menu_id is null then raise exception 'Save the event menu introduction first'; end if;
  if nullif(trim(p_course_name), '') is null or nullif(trim(p_name), '') is null then raise exception 'Course and dish names are required'; end if;
  if p_status not in ('draft', 'published', 'archived') then raise exception 'Unsupported dish status'; end if;
  if p_status = 'published' and nullif(trim(p_description), '') is null then raise exception 'Add a dish description before publishing'; end if;
  if p_item_id is not null and not exists (
    select 1 from public.menu_items
    join public.menu_courses on menu_courses.id = menu_items.course_id
    where menu_items.id = p_item_id and menu_courses.menu_id = saved_menu_id
  ) then raise exception 'Dish does not belong to this event menu'; end if;

  insert into public.menu_courses (menu_id, name, description, sort_order)
  values (saved_menu_id, trim(p_course_name), nullif(trim(p_course_description), ''), greatest(coalesce(p_course_sort_order, 0), 0))
  on conflict (menu_id, name) do update set description = excluded.description, sort_order = excluded.sort_order, updated_at = now()
  returning id into saved_course_id;

  if p_item_id is null then
    insert into public.menu_items (course_id, name, description, cultural_origin, cultural_story, ingredients, dietary_tags, allergen_notes, status, sort_order)
    values (saved_course_id, trim(p_name), nullif(trim(p_description), ''), nullif(trim(p_cultural_origin), ''),
      nullif(trim(p_cultural_story), ''), coalesce(p_ingredients, array[]::text[]), coalesce(p_dietary_tags, array[]::text[]),
      nullif(trim(p_allergen_notes), ''), p_status, greatest(coalesce(p_sort_order, 0), 0)) returning id into saved_item_id;
  else
    update public.menu_items set course_id = saved_course_id, name = trim(p_name), description = nullif(trim(p_description), ''),
      cultural_origin = nullif(trim(p_cultural_origin), ''), cultural_story = nullif(trim(p_cultural_story), ''),
      ingredients = coalesce(p_ingredients, array[]::text[]), dietary_tags = coalesce(p_dietary_tags, array[]::text[]),
      allergen_notes = nullif(trim(p_allergen_notes), ''), status = p_status,
      sort_order = greatest(coalesce(p_sort_order, 0), 0), updated_at = now()
    where id = p_item_id;
  end if;

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (actor_id, case when p_item_id is null then 'event.menu_item_created' else 'event.menu_item_updated' end,
    'menu_item', saved_item_id, jsonb_build_object('event_id', p_event_id, 'status', p_status, 'course', trim(p_course_name)));
  return saved_item_id;
end; $$;

create or replace function public.save_menu_feedback(p_item_id uuid, p_rating integer, p_is_favorite boolean, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or not exists (select 1 from public.profiles where id = actor_id and access_status = 'active') then
    raise exception 'Active membership required';
  end if;
  if p_rating is not null and p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5'; end if;
  if char_length(coalesce(p_comment, '')) > 800 then raise exception 'Comment is too long'; end if;
  if not exists (
    select 1 from public.menu_items
    join public.menu_courses on menu_courses.id = menu_items.course_id
    join public.event_menus on event_menus.id = menu_courses.menu_id
    join public.events on events.id = event_menus.event_id
    where menu_items.id = p_item_id and menu_items.status = 'published'
      and event_menus.status = 'published' and events.status = 'published'
  ) then raise exception 'Published menu item not found'; end if;

  insert into public.menu_item_feedback (item_id, user_id, rating, is_favorite, comment, moderation_status)
  values (p_item_id, actor_id, p_rating, coalesce(p_is_favorite, false), nullif(trim(p_comment), ''),
    case when nullif(trim(p_comment), '') is null then 'approved' else 'pending' end)
  on conflict (item_id, user_id) do update set rating = excluded.rating, is_favorite = excluded.is_favorite,
    comment = excluded.comment, moderation_status = case when excluded.comment is null then 'approved' else 'pending' end,
    moderated_by = null, moderated_at = null, updated_at = now();
end; $$;

create or replace function public.moderate_menu_feedback(p_item_id uuid, p_user_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); managed_event_id uuid;
begin
  select event_menus.event_id into managed_event_id from public.menu_items
  join public.menu_courses on menu_courses.id = menu_items.course_id
  join public.event_menus on event_menus.id = menu_courses.menu_id where menu_items.id = p_item_id;
  if actor_id is null or managed_event_id is null or not public.can_manage_event(managed_event_id) then raise exception 'Not authorized'; end if;
  if p_action not in ('approve', 'hide') then raise exception 'Unsupported moderation action'; end if;
  update public.menu_item_feedback set moderation_status = case when p_action = 'approve' then 'approved' else 'hidden' end,
    moderated_by = actor_id, moderated_at = now(), updated_at = now() where item_id = p_item_id and user_id = p_user_id;
  if not found then raise exception 'Feedback not found'; end if;
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (actor_id, 'event.menu_feedback_' || p_action, 'menu_item', p_item_id, jsonb_build_object('member_id', p_user_id, 'event_id', managed_event_id));
end; $$;

revoke all on function public.save_event_menu(uuid, text, text, text, text) from public;
grant execute on function public.save_event_menu(uuid, text, text, text, text) to authenticated;
revoke all on function public.save_menu_item(uuid, uuid, text, text, integer, text, text, text, text, text[], text[], text, text, integer) from public;
grant execute on function public.save_menu_item(uuid, uuid, text, text, integer, text, text, text, text, text[], text[], text, text, integer) to authenticated;
revoke all on function public.save_menu_feedback(uuid, integer, boolean, text) from public;
grant execute on function public.save_menu_feedback(uuid, integer, boolean, text) to authenticated;
revoke all on function public.moderate_menu_feedback(uuid, uuid, text) from public;
grant execute on function public.moderate_menu_feedback(uuid, uuid, text) to authenticated;

comment on table public.event_menus is 'One curated dining narrative and publication state per event.';
comment on table public.menu_item_feedback is 'Member ratings, favourites, and moderated dish comments.';
