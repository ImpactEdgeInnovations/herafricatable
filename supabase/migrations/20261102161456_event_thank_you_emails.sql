begin;
-- Applied through the connected Supabase migration service on 2 November 2026.
create table hat_event_ops.thank_you_release (
  id boolean primary key default true check(id),
  activated_at timestamptz not null default now()
);
insert into hat_event_ops.thank_you_release(id) values(true);
create table hat_event_ops.thank_you_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  enabled boolean not null default true,
  message text not null default '' check(char_length(message)<=600),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table hat_event_ops.thank_you_deliveries (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null unique references public.notification_jobs(id),
  snapshot jsonb,
  primary key(event_id,user_id)
);
alter table hat_event_ops.thank_you_release enable row level security;
alter table hat_event_ops.thank_you_settings enable row level security;
alter table hat_event_ops.thank_you_deliveries enable row level security;
revoke all on hat_event_ops.thank_you_release,hat_event_ops.thank_you_settings,hat_event_ops.thank_you_deliveries from public,anon,authenticated;

create function hat_event_ops.thank_you_due(e uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select (date_trunc('day',v.ends_at at time zone v.timezone)+interval '1 day 8 hours') at time zone v.timezone
    from public.events v where v.id=e;
$$;
create function hat_event_ops.thank_you_eligible(e uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events v join public.event_memberships m on m.event_id=v.id
    join public.profiles p on p.id=m.user_id join auth.users a on a.id=m.user_id
    cross join hat_event_ops.thank_you_release release
    left join hat_event_ops.thank_you_settings s on s.event_id=v.id
    left join public.notification_preferences pref on pref.user_id=m.user_id
    where v.id=e and m.user_id=u and v.status in ('published','completed') and v.format in ('in_person','hybrid')
      and v.ends_at>=release.activated_at and v.ends_at<now() and v.ends_at>now()-interval '3 days'
      and hat_event_ops.thank_you_due(v.id)<=now() and coalesce(s.enabled,true)
      and m.status in ('confirmed','attended') and p.access_status in ('active','pending') and a.email_confirmed_at is not null
      and coalesce(pref.email_events,true)
      and exists(select 1 from public.event_checkins c where c.event_id=v.id and c.user_id=u and c.reversed_at is null)
      and (m.order_id is null or exists(select 1 from public.orders o where o.id=m.order_id and o.status in ('paid','approved','fulfilled'))));
$$;
create function hat_event_ops.thank_you_context(e uuid,u uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; linked jsonb;
begin
  select jsonb_build_object('event_title',v.title,'event_slug',v.slug,'guest_name',
    coalesce(nullif(split_part(trim(p.display_name),' ',1),''),'there'),'ends_at',v.ends_at,'timezone',v.timezone,
    'host_name',case when h.enabled then coalesce(nullif(trim(h.display_name),''),'Your event team') else 'Your event team' end,
    'organisation_name',case when h.enabled then coalesce(h.organisation_name,'') else '' end,
    'host_message',coalesce(s.message,''),'has_recap',exists(select 1 from public.event_recaps r where r.event_id=e and r.status='published'),
    'has_networking',exists(select 1 from hat_networking.matches x where x.event_id=e and u in(x.member_a,x.member_b)
      and x.status in('completed','closed') and x.accepted_a and x.accepted_b and not public.is_blocked_pair(x.member_a,x.member_b))) into result
  from public.events v left join public.profiles p on p.id=u
    left join public.event_host_public_details h on h.event_id=v.id
    left join hat_event_ops.thank_you_settings s on s.event_id=v.id where v.id=e;
  select jsonb_build_object('name',c.name,'slug',c.slug) into linked from public.community_event_links l
    join public.communities c on c.id=l.community_id where l.event_id=e and c.status='published'
      and (c.public_preview_enabled or exists(select 1 from public.community_memberships m where m.community_id=c.id and m.user_id=u and m.status='active'))
    order by l.created_at,c.id limit 1;
  return result||jsonb_build_object('community',linked);
end; $$;
revoke all on function hat_event_ops.thank_you_due(uuid),hat_event_ops.thank_you_eligible(uuid,uuid),hat_event_ops.thank_you_context(uuid,uuid) from public,anon,authenticated;

create function public.get_event_thank_you_settings(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not hat_event_ops.manager(p_event_id) then raise exception 'Event Host access required'; end if;
  return (select jsonb_build_object('enabled',coalesce(s.enabled,true),'message',coalesce(s.message,''),
    'due_at',hat_event_ops.thank_you_due(v.id),'timezone',v.timezone,'applies',v.ends_at>=release.activated_at and v.format in ('in_person','hybrid'),
    'message_locked',exists(select 1 from hat_event_ops.thank_you_deliveries d where d.event_id=v.id),
    'queued',(select count(*) from hat_event_ops.thank_you_deliveries d join public.notification_jobs j on j.id=d.job_id where d.event_id=v.id and j.status in ('queued','processing')),
    'sent',(select count(*) from hat_event_ops.thank_you_deliveries d join public.notification_jobs j on j.id=d.job_id where d.event_id=v.id and j.status='sent' and j.provider_message_id not like 'suppressed:%'),
    'failed',(select count(*) from hat_event_ops.thank_you_deliveries d join public.notification_jobs j on j.id=d.job_id where d.event_id=v.id and j.status='failed'),
    'suppressed',(select count(*) from hat_event_ops.thank_you_deliveries d join public.notification_jobs j on j.id=d.job_id where d.event_id=v.id and (j.status='suppressed' or j.provider_message_id like 'suppressed:%')),
    'preview',hat_event_ops.thank_you_context(v.id,null)||jsonb_build_object('guest_name','Amina'))
  from public.events v cross join hat_event_ops.thank_you_release release left join hat_event_ops.thank_you_settings s on s.event_id=v.id where v.id=p_event_id);
end; $$;

create function public.save_event_thank_you_settings(p_event_id uuid,p_enabled boolean,p_message text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare clean text:=trim(coalesce(p_message,'')); old_message text;
begin
  if auth.uid() is null or not hat_event_ops.manager(p_event_id) then raise exception 'Event Host access required'; end if;
  if p_enabled is null or char_length(clean)>600 then raise exception 'Choose a setting and keep your message within 600 characters'; end if;
  perform 1 from public.events where id=p_event_id for update;
  select coalesce((select message from hat_event_ops.thank_you_settings where event_id=p_event_id),'') into old_message;
  if clean<>old_message and exists(select 1 from hat_event_ops.thank_you_deliveries where event_id=p_event_id) then raise exception 'The message is locked because email preparation has started'; end if;
  insert into hat_event_ops.thank_you_settings(event_id,enabled,message,updated_by) values(p_event_id,p_enabled,clean,auth.uid())
    on conflict(event_id) do update set enabled=excluded.enabled,message=excluded.message,updated_by=auth.uid(),updated_at=now();
  if not p_enabled then
    update public.notification_jobs j set status='suppressed',last_error='event_thank_you_disabled',updated_at=now()
      from hat_event_ops.thank_you_deliveries d where d.job_id=j.id and d.event_id=p_event_id and j.status='queued';
  else
    update public.notification_jobs j set status='queued',last_error=null,next_attempt_at=now(),updated_at=now()
      from hat_event_ops.thank_you_deliveries d where d.job_id=j.id and d.event_id=p_event_id and j.status='suppressed'
        and j.last_error='event_thank_you_disabled' and j.attempts=0;
  end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'event.thank_you_settings','event',p_event_id,jsonb_build_object('enabled',p_enabled));
  return public.get_event_thank_you_settings(p_event_id);
end; $$;

-- Optional scope supports isolated rehearsals without preparing unrelated events.
create function public.queue_due_event_thank_yous(p_event_id uuid default null) returns integer
language plpgsql security definer set search_path='' as $$
declare e record; guest record; job uuid; queued integer:=0;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required'; end if;
  for e in select v.id,v.slug,v.title from public.events v cross join hat_event_ops.thank_you_release release
    where (p_event_id is null or v.id=p_event_id) and v.status in ('published','completed') and v.format in ('in_person','hybrid') and v.ends_at>=release.activated_at
      and v.ends_at<now() and v.ends_at>now()-interval '3 days' and hat_event_ops.thank_you_due(v.id)<=now()
      and exists(select 1 from public.event_memberships m where m.event_id=v.id and hat_event_ops.thank_you_eligible(v.id,m.user_id)
        and not exists(select 1 from hat_event_ops.thank_you_deliveries d where d.event_id=v.id and d.user_id=m.user_id))
    order by v.ends_at,v.id limit 25 for update of v skip locked loop
    for guest in select m.user_id,u.email from public.event_memberships m join auth.users u on u.id=m.user_id
      where m.event_id=e.id and hat_event_ops.thank_you_eligible(e.id,m.user_id)
        and not exists(select 1 from hat_event_ops.thank_you_deliveries d where d.event_id=e.id and d.user_id=m.user_id)
      order by m.user_id limit 500 loop
      insert into public.notification_jobs(user_id,template_key,to_email,payload,dedupe_key)
        values(guest.user_id,'event',guest.email,jsonb_build_object('title','Thank you for joining '||e.title,'href','/events/'||e.slug),
          'event-thank-you:'||e.id||':'||guest.user_id) on conflict(user_id,channel,dedupe_key) do nothing returning id into job;
      if job is not null then
        insert into hat_event_ops.thank_you_deliveries(event_id,user_id,job_id) values(e.id,guest.user_id,job);
        queued:=queued+1;
      end if;
    end loop;
  end loop;
  return queued;
end; $$;

create function public.get_event_thank_you_email(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d hat_event_ops.thank_you_deliveries; j public.notification_jobs; result jsonb;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required'; end if;
  select * into d from hat_event_ops.thank_you_deliveries where job_id=p_job_id for update;
  if not found then return null; end if;
  select * into j from public.notification_jobs where id=p_job_id;
  if j.status<>'processing' or j.locked_at is null or j.locked_at<now()-interval '15 minutes' or j.template_key<>'event'
    or j.user_id<>d.user_id or j.dedupe_key<>'event-thank-you:'||d.event_id||':'||d.user_id
    or not exists(select 1 from auth.users where id=d.user_id and lower(email)=lower(j.to_email))
    or not hat_event_ops.thank_you_eligible(d.event_id,d.user_id) then return null; end if;
  if d.snapshot is not null then return d.snapshot; end if;
  result:=hat_event_ops.thank_you_context(d.event_id,d.user_id);
  update hat_event_ops.thank_you_deliveries set snapshot=result where job_id=p_job_id;
  return result;
end; $$;
revoke all on function public.get_event_thank_you_settings(uuid),public.save_event_thank_you_settings(uuid,boolean,text),public.queue_due_event_thank_yous(uuid),public.get_event_thank_you_email(uuid) from public,anon,authenticated;
grant execute on function public.get_event_thank_you_settings(uuid),public.save_event_thank_you_settings(uuid,boolean,text) to authenticated;
grant execute on function public.queue_due_event_thank_yous(uuid),public.get_event_thank_you_email(uuid) to service_role;
commit;
