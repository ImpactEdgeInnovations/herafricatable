begin;

-- Version aligned with the applied live migration history.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.verify_notification_dispatch_token(p_token text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare saved text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required';end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false;end if;
 select decrypted_secret into saved from vault.decrypted_secrets where name='hat_notification_dispatch_token';
 return saved is not null and pg_catalog.sha256(pg_catalog.convert_to(saved,'UTF8'))=pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8'));
end;$$;

create or replace function public.configure_notification_dispatcher(p_token text,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $function$
declare secret_id uuid; job record;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required';end if;
 if p_enabled is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'A valid dispatcher token and setting are required';end if;
 select id into secret_id from vault.secrets where name='hat_notification_dispatch_token' for update;
 if secret_id is null then
  perform vault.create_secret(p_token,'hat_notification_dispatch_token','Her Africa Table notification dispatcher');
 else perform vault.update_secret(secret_id,p_token);end if;
 for job in select jobid from cron.job where jobname in('hat-notification-dispatch','hat-notification-housekeeping') loop perform cron.unschedule(job.jobid);end loop;
 if p_enabled then
  perform cron.schedule('hat-notification-dispatch','*/5 * * * *',$job$
   select net.http_get(url:='https://www.herafricatable.com/api/cron/notifications?dispatch=1',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='hat_notification_dispatch_token')),
    timeout_milliseconds:=10000);
  $job$);
  perform cron.schedule('hat-notification-housekeeping','0 5 * * *',$job$
   select net.http_get(url:='https://www.herafricatable.com/api/cron/notifications',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='hat_notification_dispatch_token')),
    timeout_milliseconds:=10000);
  $job$);
 end if;
end;$function$;

create or replace function public.get_notification_dispatcher_status()
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required';end if;
 return exists(select 1 from cron.job where jobname='hat-notification-dispatch' and active)
  and exists(select 1 from vault.secrets where name='hat_notification_dispatch_token');
end;$$;
revoke all on function public.verify_notification_dispatch_token(text) from public,anon,authenticated;
revoke all on function public.configure_notification_dispatcher(text,boolean) from public,anon,authenticated;
revoke all on function public.get_notification_dispatcher_status() from public,anon,authenticated;
grant execute on function public.verify_notification_dispatch_token(text) to service_role;
grant execute on function public.configure_notification_dispatcher(text,boolean) to service_role;
grant execute on function public.get_notification_dispatcher_status() to service_role;

commit;
