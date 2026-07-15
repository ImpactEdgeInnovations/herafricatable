create table public.site_event_countdown (
  id boolean primary key default true check (id),
  event_name text not null,
  city text not null,
  starts_at timestamptz not null,
  is_published boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_event_countdown enable row level security;

create policy "Anyone can read the published countdown"
  on public.site_event_countdown for select
  to anon, authenticated
  using (is_published);

create policy "Event admins can read countdown settings"
  on public.site_event_countdown for select
  to authenticated
  using (public.is_admin(array['super_admin', 'event_staff']::public.app_role[]));

create policy "Event admins can create countdown settings"
  on public.site_event_countdown for insert
  to authenticated
  with check (public.is_admin(array['super_admin', 'event_staff']::public.app_role[]));

create policy "Event admins can update countdown settings"
  on public.site_event_countdown for update
  to authenticated
  using (public.is_admin(array['super_admin', 'event_staff']::public.app_role[]))
  with check (public.is_admin(array['super_admin', 'event_staff']::public.app_role[]));

comment on table public.site_event_countdown is
  'Single-row public countdown controlled by authorized event administrators.';
