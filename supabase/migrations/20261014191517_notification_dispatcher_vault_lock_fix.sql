begin;

-- Version aligned with the applied live migration history.

create or replace function public.configure_notification_dispatcher(p_token text,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $function$
declare secret_id uuid; job record;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required';end if;
 if p_enabled is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'A valid dispatcher token and setting are required';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hat-notification-dispatch-config',0));
 select id into secret_id from vault.secrets where name='hat_notification_dispatch_token';
 if secret_id is null then
  perform vault.create_secret(p_token,'hat_notification_dispatch_token','Her Africa Table notification dispatcher');
 else perform vault.update_secret(secret_id,p_token);end if;
 for job in select jobid from cron.job where jobname in('hat-notification-dispatch','hat-notification-housekeeping') loop perform cron.unschedule(job.jobid);end loop;
 if p_enabled then
  perform cron.schedule('hat-notification-dispatch','*/5 * * * *',$job$
   select net.http_get(url:='https://www.herafricatable.com/api/cron/notifications?dispatch=1',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='hat_notification_dispatch_token')),
    timeout_milliseconds:=30000);
  $job$);
  perform cron.schedule('hat-notification-housekeeping','0 5 * * *',$job$
   select net.http_get(url:='https://www.herafricatable.com/api/cron/notifications',
    headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='hat_notification_dispatch_token')),
    timeout_milliseconds:=30000);
  $job$);
 end if;
end;$function$;
revoke all on function public.configure_notification_dispatcher(text,boolean) from public,anon,authenticated;
grant execute on function public.configure_notification_dispatcher(text,boolean) to service_role;

commit;
