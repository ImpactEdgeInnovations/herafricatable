insert into public.site_event_countdown (
  id,
  event_name,
  city,
  starts_at,
  is_published,
  updated_at
)
values (
  true,
  'Launch of the Africa Table Platform',
  'Nairobi',
  '2026-09-13T18:36:42Z'::timestamptz,
  true,
  now()
)
on conflict (id) do update
set
  event_name = excluded.event_name,
  city = excluded.city,
  starts_at = excluded.starts_at,
  is_published = excluded.is_published,
  updated_at = excluded.updated_at;
