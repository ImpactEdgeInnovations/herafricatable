begin;

create table public.notification_preferences(
 user_id uuid primary key references auth.users(id)on delete cascade,in_app_enabled boolean not null default true,
 email_network boolean not null default true,email_events boolean not null default true,email_support boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.notifications(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,
 kind text not null check(kind in('system','network','event','registration','support','privacy')),title text not null check(char_length(title)between 2 and 160),
 body text not null check(char_length(body)between 2 and 1000),href text check(href is null or href~'^/'),dedupe_key text not null,
 read_at timestamptz,created_at timestamptz not null default now(),unique(user_id,dedupe_key)
);
create table public.notification_jobs(
 id uuid primary key default gen_random_uuid(),notification_id uuid references public.notifications(id)on delete set null,user_id uuid not null references auth.users(id)on delete cascade,
 channel text not null default'email'check(channel='email'),template_key text not null,to_email text not null,payload jsonb not null default'{}'::jsonb,dedupe_key text not null,
 status text not null default'queued'check(status in('queued','processing','sent','failed','suppressed')),attempts smallint not null default 0 check(attempts between 0 and 10),
 next_attempt_at timestamptz not null default now(),locked_at timestamptz,provider_message_id text,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,channel,dedupe_key)
);
create table public.notification_deliveries(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.notification_jobs(id)on delete cascade,attempt_number smallint not null,
 status text not null check(status in('sent','failed')),provider_message_id text,error_code text,created_at timestamptz not null default now(),unique(job_id,attempt_number)
);
create index notifications_member_created_idx on public.notifications(user_id,created_at desc);
create index notification_jobs_worker_idx on public.notification_jobs(status,next_attempt_at,created_at)where status in('queued','processing');
create index notification_jobs_admin_idx on public.notification_jobs(status,updated_at desc);
alter table public.notification_preferences enable row level security;alter table public.notifications enable row level security;alter table public.notification_jobs enable row level security;alter table public.notification_deliveries enable row level security;
create policy "Members read notification preferences"on public.notification_preferences for select to authenticated using(user_id=auth.uid());
create policy "Members read own notifications"on public.notifications for select to authenticated using(user_id=auth.uid());
create policy "Super admins read notification jobs"on public.notification_jobs for select to authenticated using(public.is_admin(array['super_admin']::public.app_role[]));
create policy "Super admins read notification deliveries"on public.notification_deliveries for select to authenticated using(public.is_admin(array['super_admin']::public.app_role[]));

create or replace function public.enqueue_notification(p_user_id uuid,p_kind text,p_title text,p_body text,p_href text,p_dedupe_key text)
returns uuid language plpgsql security definer set search_path=''as $$
declare saved uuid;email_allowed boolean;in_app boolean;recipient text;
begin
 if p_kind not in('system','network','event','registration','support','privacy')or nullif(trim(p_dedupe_key),'')is null then raise exception'Invalid notification';end if;
 if not exists(select 1 from public.profiles where id=p_user_id and access_status<>'deleted')then return null;end if;
 insert into public.notification_preferences(user_id)values(p_user_id)on conflict(user_id)do nothing;
 select np.in_app_enabled,case p_kind when'network'then np.email_network when'event'then np.email_events when'support'then np.email_support else true end,u.email::text into in_app,email_allowed,recipient from public.notification_preferences np join auth.users u on u.id=np.user_id where np.user_id=p_user_id;
 if in_app then insert into public.notifications(user_id,kind,title,body,href,dedupe_key)values(p_user_id,p_kind,left(trim(p_title),160),left(trim(p_body),1000),p_href,trim(p_dedupe_key))on conflict(user_id,dedupe_key)do update set title=excluded.title,body=excluded.body,href=excluded.href returning id into saved;end if;
 if email_allowed and recipient is not null then insert into public.notification_jobs(notification_id,user_id,template_key,to_email,payload,dedupe_key)values(saved,p_user_id,p_kind,recipient,jsonb_build_object('title',left(trim(p_title),160),'body',left(trim(p_body),1000),'href',p_href),trim(p_dedupe_key))on conflict(user_id,channel,dedupe_key)do nothing;end if;
 return saved;
end;$$;

create or replace function public.update_notification_preferences(p_in_app boolean,p_email_network boolean,p_email_events boolean,p_email_support boolean)
returns void language plpgsql security definer set search_path=''as $$begin
 if auth.uid()is null then raise exception'Authentication required';end if;
 insert into public.notification_preferences(user_id,in_app_enabled,email_network,email_events,email_support)values(auth.uid(),p_in_app,p_email_network,p_email_events,p_email_support)
 on conflict(user_id)do update set in_app_enabled=excluded.in_app_enabled,email_network=excluded.email_network,email_events=excluded.email_events,email_support=excluded.email_support,updated_at=now();
end;$$;
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path=''as $$begin update public.notifications set read_at=coalesce(read_at,now())where id=p_notification_id and user_id=auth.uid();if not found then raise exception'Notification not found';end if;end;$$;
create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path=''as $$update public.notifications set read_at=coalesce(read_at,now())where user_id=auth.uid()and read_at is null$$;

create or replace function public.notify_connection_event()returns trigger language plpgsql security definer set search_path=''as $$begin
 if tg_op='INSERT'and new.status='pending'then perform public.enqueue_notification(new.recipient_id,'network','New connection request','A member would like to connect with you.','/network','connection-request:'||new.id);elsif tg_op='UPDATE'and old.status is distinct from new.status and new.status='accepted'then perform public.enqueue_notification(new.requester_id,'network','Connection accepted','Your connection request was accepted.','/network','connection-accepted:'||new.id);end if;return new;end;$$;
create trigger notify_connection_change after insert or update of status on public.connections for each row execute function public.notify_connection_event();

create or replace function public.notify_support_reply()returns trigger language plpgsql security definer set search_path=''as $$declare ticket public.support_tickets%rowtype;admin_id uuid;begin
 select *into ticket from public.support_tickets where id=new.ticket_id;
 if new.is_staff then perform public.enqueue_notification(ticket.requester_id,'support','Support replied to your request','A new private reply is available for '||ticket.reference||'.','/support?ticket='||ticket.id,'support-reply:'||new.id);elsif ticket.assigned_to is not null then perform public.enqueue_notification(ticket.assigned_to,'support','Member replied to support','A member replied to '||ticket.reference||'.','/admin/support?ticket='||ticket.id,'support-member-reply:'||new.id);else for admin_id in select user_id from public.user_roles where role='super_admin'loop perform public.enqueue_notification(admin_id,'support','New support reply','A member replied to '||ticket.reference||'.','/admin/support?ticket='||ticket.id,'support-member-reply:'||new.id);end loop;end if;return new;end;$$;
create trigger notify_support_message after insert on public.support_messages for each row execute function public.notify_support_reply();

create or replace function public.notify_new_support_ticket()returns trigger language plpgsql security definer set search_path=''as $$declare admin_id uuid;begin for admin_id in select user_id from public.user_roles where role='super_admin'loop perform public.enqueue_notification(admin_id,'support','New support request',new.reference||': '||new.subject,'/admin/support?ticket='||new.id,'support-created:'||new.id);end loop;return new;end;$$;
create trigger notify_support_ticket_insert after insert on public.support_tickets for each row execute function public.notify_new_support_ticket();

create or replace function public.notify_order_event()returns trigger language plpgsql security definer set search_path=''as $$declare event_title text;begin
 if tg_op='UPDATE'and old.status is not distinct from new.status then return new;end if;select title into event_title from public.events where id=new.event_id;
 perform public.enqueue_notification(new.user_id,'registration','Registration update',coalesce(event_title,'Your event')||' registration is now '||replace(new.status,'_',' ')||'.','/orders/'||new.reference,'order-status:'||new.id||':'||new.status);return new;end;$$;
create trigger notify_order_status after insert or update of status on public.orders for each row execute function public.notify_order_event();

create or replace function public.notify_published_announcement()returns trigger language plpgsql security definer set search_path=''as $$declare member_id uuid;event_slug text;begin
 if new.status='published'and(tg_op='INSERT'or old.status is distinct from'published')then select slug into event_slug from public.events where id=new.event_id;for member_id in select user_id from public.event_memberships where event_id=new.event_id and status in('registered','confirmed','attended')loop perform public.enqueue_notification(member_id,'event',new.title,new.body,'/events/'||event_slug,'announcement:'||new.id);end loop;end if;return new;end;$$;
create trigger notify_announcement_publish after insert or update of status on public.event_announcements for each row execute function public.notify_published_announcement();

create or replace function public.claim_notification_jobs(p_limit integer default 25)
returns table(job_id uuid,to_email text,template_key text,payload jsonb,attempt_number smallint,dedupe_key text)language plpgsql security definer set search_path=''as $$begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'then raise exception'Service role required';end if;
 return query with selected as(select id from public.notification_jobs where(status='queued'and next_attempt_at<=now())or(status='processing'and locked_at<now()-interval'15 minutes')order by created_at for update skip locked limit least(greatest(coalesce(p_limit,25),1),50)),updated as(update public.notification_jobs j set status='processing',attempts=j.attempts+1,locked_at=now(),updated_at=now()from selected where j.id=selected.id returning j.*)select u.id,u.to_email,u.template_key,u.payload,u.attempts,u.dedupe_key from updated u;
end;$$;
create or replace function public.finish_notification_job(p_job_id uuid,p_success boolean,p_provider_message_id text,p_error_code text)
returns void language plpgsql security definer set search_path=''as $$declare target public.notification_jobs%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'then raise exception'Service role required';end if;select *into target from public.notification_jobs where id=p_job_id and status='processing'for update;if not found then raise exception'Processing job not found';end if;
 insert into public.notification_deliveries(job_id,attempt_number,status,provider_message_id,error_code)values(target.id,target.attempts,case when p_success then'sent'else'failed'end,nullif(p_provider_message_id,''),nullif(left(coalesce(p_error_code,''),120),''));
 update public.notification_jobs set status=case when p_success then'sent'when attempts>=5 then'failed'else'queued'end,provider_message_id=case when p_success then p_provider_message_id else provider_message_id end,last_error=case when p_success then null else left(coalesce(p_error_code,'provider_error'),500)end,next_attempt_at=case when p_success then next_attempt_at else now()+make_interval(mins=>power(2,least(attempts,5))::integer*5)end,locked_at=null,updated_at=now()where id=target.id;
end;$$;
create or replace function public.list_admin_notification_jobs()
returns table(job_id uuid,to_email text,template_key text,status text,attempts smallint,provider_message_id text,last_error text,next_attempt_at timestamptz,created_at timestamptz,updated_at timestamptz)language plpgsql stable security definer set search_path=''as $$begin if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;return query select j.id,j.to_email,j.template_key,j.status,j.attempts,j.provider_message_id,j.last_error,j.next_attempt_at,j.created_at,j.updated_at from public.notification_jobs j order by case j.status when'failed'then 0 when'processing'then 1 when'queued'then 2 else 3 end,j.updated_at desc limit 250;end;$$;
create or replace function public.retry_notification_job(p_job_id uuid)returns void language plpgsql security definer set search_path=''as $$begin if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;update public.notification_jobs set status='queued',attempts=0,next_attempt_at=now(),locked_at=null,last_error=null,updated_at=now()where id=p_job_id and status='failed';if not found then raise exception'Failed notification job not found';end if;insert into public.audit_events(actor_id,action,target_type,target_id)values(auth.uid(),'notification.retry_requested','notification_job',p_job_id);end;$$;

do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime')and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'and schemaname='public'and tablename='notifications')then alter publication supabase_realtime add table public.notifications;end if;end$$;
revoke all on function public.enqueue_notification(uuid,text,text,text,text,text)from public;
revoke all on function public.update_notification_preferences(boolean,boolean,boolean,boolean)from public;grant execute on function public.update_notification_preferences(boolean,boolean,boolean,boolean)to authenticated;
revoke all on function public.mark_notification_read(uuid)from public;grant execute on function public.mark_notification_read(uuid)to authenticated;
revoke all on function public.mark_all_notifications_read()from public;grant execute on function public.mark_all_notifications_read()to authenticated;
revoke all on function public.claim_notification_jobs(integer)from public;grant execute on function public.claim_notification_jobs(integer)to service_role;
revoke all on function public.finish_notification_job(uuid,boolean,text,text)from public;grant execute on function public.finish_notification_job(uuid,boolean,text,text)to service_role;
revoke all on function public.list_admin_notification_jobs()from public;grant execute on function public.list_admin_notification_jobs()to authenticated;
revoke all on function public.retry_notification_job(uuid)from public;grant execute on function public.retry_notification_job(uuid)to authenticated;

commit;
