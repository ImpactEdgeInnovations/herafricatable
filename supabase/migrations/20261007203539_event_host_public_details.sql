begin;
-- Separate, explicit public fields: never reuse Auth email or profile_private.
create table public.event_host_public_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  host_id uuid not null references public.profiles(id),
  display_name text not null default '',
  introduction text not null default '',
  website_url text,
  linkedin_url text,
  instagram_url text,
  contact_email text,
  contact_phone text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check(char_length(display_name)<=120 and (not enabled or char_length(trim(display_name))>=2)),
  check(char_length(introduction)<=500),
  check(website_url is null or (char_length(website_url)<=500 and website_url ~ '^https://[^[:space:]]+$')),
  check(linkedin_url is null or (char_length(linkedin_url)<=500 and linkedin_url ~ '^https://(www\.)?linkedin\.com/[^[:space:]]*$')),
  check(instagram_url is null or (char_length(instagram_url)<=500 and instagram_url ~ '^https://(www\.)?instagram\.com/[^[:space:]]*$')),
  check(contact_email is null or (char_length(contact_email)<=254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  check(contact_phone is null or (char_length(contact_phone) between 7 and 40 and contact_phone ~ '^\+?[0-9 ()-]+$'))
);
alter table public.event_host_public_details enable row level security;
revoke all on public.event_host_public_details from public,anon,authenticated;
grant select on public.event_host_public_details to authenticated;
create policy "Current Hosts read their public event settings"
on public.event_host_public_details for select to authenticated
using (public.can_host_event(event_id));

create or replace function public.save_event_host_public_details(p_event_id uuid,p_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_host_event(p_event_id) then raise exception 'Active event Host required'; end if;
  insert into public.event_host_public_details(event_id,host_id,display_name,introduction,website_url,linkedin_url,instagram_url,contact_email,contact_phone,enabled)
  values(p_event_id,auth.uid(),trim(coalesce(p_details->>'display_name','')),trim(coalesce(p_details->>'introduction','')),
    nullif(trim(p_details->>'website_url'),''),nullif(trim(p_details->>'linkedin_url'),''),nullif(trim(p_details->>'instagram_url'),''),
    nullif(trim(p_details->>'contact_email'),''),nullif(trim(p_details->>'contact_phone'),''),coalesce((p_details->>'enabled')::boolean,false))
  on conflict(event_id) do update set host_id=excluded.host_id,display_name=excluded.display_name,introduction=excluded.introduction,
    website_url=excluded.website_url,linkedin_url=excluded.linkedin_url,instagram_url=excluded.instagram_url,
    contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,enabled=excluded.enabled,updated_at=now();
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'event.host_public_details_saved','event',p_event_id,jsonb_build_object('enabled',coalesce((p_details->>'enabled')::boolean,false)));
end; $$;
revoke all on function public.save_event_host_public_details(uuid,jsonb) from public,anon;
grant execute on function public.save_event_host_public_details(uuid,jsonb) to authenticated;

create or replace function public.get_event_public_host(p_event_id uuid)
returns table(display_name text,introduction text,website_url text,linkedin_url text,instagram_url text,contact_email text,contact_phone text)
language sql stable security definer set search_path='' as $$
  select d.display_name,d.introduction,d.website_url,d.linkedin_url,d.instagram_url,d.contact_email,d.contact_phone
  from public.event_host_public_details d
  join public.events e on e.id=d.event_id
  join public.profiles p on p.id=d.host_id
  where d.event_id=p_event_id and d.enabled and p.access_status='active'
    and e.status in ('published','completed') and public.can_view_event(e.id)
    and exists(select 1 from public.event_hosts h where h.event_id=e.id and h.user_id=d.host_id and h.status='active')
    and (auth.uid() is null or not public.is_blocked_pair(auth.uid(),d.host_id));
$$;
revoke all on function public.get_event_public_host(uuid) from public;
grant execute on function public.get_event_public_host(uuid) to anon,authenticated;
commit;
