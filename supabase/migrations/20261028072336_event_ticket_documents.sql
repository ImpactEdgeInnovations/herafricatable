begin;

alter table public.event_host_public_details add column if not exists organisation_name text not null default '';
alter table public.event_host_public_details add constraint event_host_organisation_length check(char_length(organisation_name)<=160);

create schema if not exists hat_tickets;
revoke all on schema hat_tickets from public,anon,authenticated;
create table hat_tickets.email_snapshots (
  job_id uuid primary key references public.notification_jobs(id) on delete cascade,
  ticket jsonb not null,
  expires_at timestamptz not null
);
alter table hat_tickets.email_snapshots enable row level security;
revoke all on hat_tickets.email_snapshots from public,anon,authenticated;
create index on hat_tickets.email_snapshots(expires_at);

create or replace function public.save_event_host_public_details(p_event_id uuid,p_details jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_host_event(p_event_id) then raise exception 'Active event Host required'; end if;
  insert into public.event_host_public_details(event_id,host_id,display_name,organisation_name,introduction,website_url,linkedin_url,instagram_url,contact_email,contact_phone,enabled)
  values(p_event_id,auth.uid(),trim(coalesce(p_details->>'display_name','')),trim(coalesce(p_details->>'organisation_name','')),trim(coalesce(p_details->>'introduction','')),
    nullif(trim(p_details->>'website_url'),''),nullif(trim(p_details->>'linkedin_url'),''),nullif(trim(p_details->>'instagram_url'),''),
    nullif(trim(p_details->>'contact_email'),''),nullif(trim(p_details->>'contact_phone'),''),coalesce((p_details->>'enabled')::boolean,false))
  on conflict(event_id) do update set host_id=excluded.host_id,display_name=excluded.display_name,organisation_name=excluded.organisation_name,introduction=excluded.introduction,
    website_url=excluded.website_url,linkedin_url=excluded.linkedin_url,instagram_url=excluded.instagram_url,
    contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,enabled=excluded.enabled,updated_at=now();
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'event.host_public_details_saved','event',p_event_id,jsonb_build_object('enabled',coalesce((p_details->>'enabled')::boolean,false)));
end; $$;

-- Private helper: no direct API grants; wrappers establish the actual recipient.
create function hat_tickets.build_ticket(p_event_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  place public.event_memberships%rowtype; evt public.events%rowtype; ord public.orders%rowtype;
  credential public.event_checkin_credentials%rowtype; host_name text; organisation text;
  guest_name text; ticket_name text; venue text; checked timestamptz; arrival_notes text; networking jsonb;
begin
  select * into place from public.event_memberships where event_id=p_event_id and user_id=p_user_id for update;
  if not found or place.status not in ('confirmed','attended') then return null; end if;
  select * into evt from public.events where id=p_event_id and status in ('published','completed');
  if not found then return null; end if;
  select nullif(trim(display_name),'') into guest_name from public.profiles
    where id=p_user_id and access_status in ('active','pending');
  if not found then return null; end if;
  if place.order_id is not null then
    select * into ord from public.orders where id=place.order_id and user_id=p_user_id and event_id=p_event_id and order_type='event';
    if not found or ord.status not in ('approved','paid','fulfilled') then return null; end if;
  end if;
  select * into credential from public.event_checkin_credentials where event_id=p_event_id and user_id=p_user_id for update;
  if found and credential.revoked_at is not null then return null; end if;
  if not found then
    insert into public.event_checkin_credentials(event_id,user_id,manual_code,expires_at)
    values(p_event_id,p_user_id,upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),evt.ends_at+interval '1 day')
    on conflict(event_id,user_id) do nothing;
    select * into credential from public.event_checkin_credentials where event_id=p_event_id and user_id=p_user_id;
  end if;
  select name into ticket_name from public.ticket_types where id=place.ticket_type_id and event_id=p_event_id;
  select concat_ws(', ',name,nullif(address_line,''),nullif(city,'')) into venue from public.venues where id=evt.venue_id;
  select checked_in_at into checked from public.event_checkins where event_id=p_event_id and user_id=p_user_id and reversed_at is null;
  select nullif(trim(a.body),'') into arrival_notes from public.event_announcements a
    where a.event_id=p_event_id and a.host_workspace_key='arrival' and a.status='published' limit 1;
  select jsonb_build_object('starts_at',s.starts_at,'ends_at',s.ends_at,'minutes',s.minutes) into networking
    from hat_networking.sessions s where s.event_id=p_event_id and not s.disabled and s.status<>'finished';
  select d.display_name,d.organisation_name into host_name,organisation
    from public.event_host_public_details d join public.profiles p on p.id=d.host_id
    where d.event_id=p_event_id and d.enabled and p.access_status='active'
      and exists(select 1 from public.event_hosts h where h.event_id=p_event_id and h.user_id=d.host_id and h.status='active')
      and not public.is_blocked_pair(p_user_id,d.host_id);
  return jsonb_build_object('event_id',evt.id,'event_slug',evt.slug,'event_title',evt.title,
    'starts_at',evt.starts_at,'ends_at',evt.ends_at,'timezone',evt.timezone,'venue',coalesce(nullif(venue,''),'Online'),
    'guest_name',coalesce(guest_name,'Event guest'),'ticket_type',coalesce(ticket_name,'Event admission'),
    'booking_reference',coalesce(ord.reference,'Direct registration'),'host_name',coalesce(nullif(trim(host_name),''),'Event organising team'),
    'organisation_name',coalesce(organisation,''),'qr_payload','HATCHECKIN:'||evt.id::text||':'||credential.qr_token,
    'manual_code',credential.manual_code,'issued_at',credential.issued_at,'checked_in_at',checked,
    'event_ended',evt.ends_at<now(),'arrival_info',coalesce(arrival_notes,''),'networking',networking);
end; $$;
revoke all on function hat_tickets.build_ticket(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_my_event_ticket(p_slug text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into target from public.events where slug=p_slug;
  if target is null then return null; end if;
  return hat_tickets.build_ticket(target,auth.uid());
end; $$;
revoke all on function public.get_my_event_ticket(text) from public,anon;
grant execute on function public.get_my_event_ticket(text) to authenticated;

create function public.list_my_event_tickets(p_offset integer default 0)
returns table(event_slug text,event_title text,starts_at timestamptz,ends_at timestamptz,timezone text,status text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query select e.slug,e.title,e.starts_at,e.ends_at,e.timezone,m.status
    from public.event_memberships m join public.events e on e.id=m.event_id
    left join public.orders o on o.id=m.order_id
    join public.profiles p on p.id=m.user_id
    where m.user_id=auth.uid() and m.status in ('confirmed','attended') and e.status in ('published','completed')
      and p.access_status in ('active','pending') and (m.order_id is null or (o.user_id=m.user_id and o.event_id=e.id and o.status in ('approved','paid','fulfilled')))
      and not exists(select 1 from public.event_checkin_credentials c where c.event_id=m.event_id and c.user_id=m.user_id and c.revoked_at is not null)
    order by (e.ends_at>=now()) desc,e.starts_at desc,e.id
    offset least(greatest(coalesce(p_offset,0),0),12000) limit 13;
end; $$;
revoke all on function public.list_my_event_tickets(integer) from public,anon;
grant execute on function public.list_my_event_tickets(integer) to authenticated;

-- Only an actually claimed confirmation job can obtain an email attachment.
-- Recheck eligibility on every retry; stable snapshots keep provider idempotency.
create function public.get_event_ticket_email(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.notification_jobs%rowtype; ord public.orders%rowtype; current_ticket jsonb; saved jsonb;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required'; end if;
  select * into job from public.notification_jobs where id=p_job_id and status='processing' and template_key='registration' for update;
  if not found or job.dedupe_key !~ '^order-status:[0-9a-f-]{36}:fulfilled$' then return null; end if;
  select * into ord from public.orders where id=split_part(job.dedupe_key,':',2)::uuid and user_id=job.user_id;
  if not found then return null; end if;
  if ord.order_type<>'event' then return jsonb_build_object('not_event',true); end if;
  if ord.status<>'fulfilled' or not exists(select 1 from auth.users u where u.id=job.user_id and lower(u.email::text)=lower(job.to_email)) then return null; end if;
  if not exists(select 1 from public.events e where e.id=ord.event_id and e.status='published' and e.ends_at>now()) then return null; end if;
  if not exists(select 1 from public.event_memberships m where m.event_id=ord.event_id and m.user_id=job.user_id and m.order_id=ord.id) then return null; end if;
  current_ticket:=hat_tickets.build_ticket(ord.event_id,job.user_id);
  if current_ticket is null then return null; end if;
  delete from hat_tickets.email_snapshots where job_id in (select job_id from hat_tickets.email_snapshots where expires_at<now() limit 100);
  insert into hat_tickets.email_snapshots(job_id,ticket,expires_at) values(job.id,current_ticket,(current_ticket->>'ends_at')::timestamptz+interval '30 days') on conflict(job_id) do nothing;
  select ticket into saved from hat_tickets.email_snapshots where job_id=job.id;
  -- Never reuse a pre-revocation credential if a booking has since changed.
  if saved->>'qr_payload' is distinct from current_ticket->>'qr_payload' then return null; end if;
  return saved;
end; $$;
revoke all on function public.get_event_ticket_email(uuid) from public,anon,authenticated;
grant execute on function public.get_event_ticket_email(uuid) to service_role;
revoke all on all functions in schema hat_tickets from public,anon,authenticated,service_role;

commit;
