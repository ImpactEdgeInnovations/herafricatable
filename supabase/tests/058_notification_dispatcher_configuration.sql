-- TEST ONLY. Vault token and scheduled jobs are restored by rollback.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
begin
 perform public.configure_notification_dispatcher(repeat('a',64),false);
 if not public.verify_notification_dispatch_token(repeat('a',64)) then raise exception 'Vault token could not be checked';end if;
 if public.verify_notification_dispatch_token(repeat('b',64)) or public.verify_notification_dispatch_token('invalid') then raise exception 'Wrong token accepted';end if;
 if public.get_notification_dispatcher_status() then raise exception 'Disabled scheduler reported ready';end if;
 perform public.configure_notification_dispatcher(repeat('a',64),true);
 if not public.get_notification_dispatcher_status() then raise exception 'Enabled scheduler not confirmed';end if;
 if (select count(*) from cron.job where jobname='hat-notification-dispatch' and schedule='*/5 * * * *' and active)<>1 then raise exception 'Five-minute job missing or duplicated';end if;
 if (select count(*) from cron.job where jobname='hat-notification-housekeeping' and schedule='0 5 * * *' and active)<>1 then raise exception 'Daily housekeeping missing';end if;
 if has_function_privilege('authenticated','public.configure_notification_dispatcher(text,boolean)','execute') or has_function_privilege('anon','public.verify_notification_dispatch_token(text)','execute') then raise exception 'Scheduler API exposed to members or visitors';end if;
end;$$;
select 'PASS: transactional Vault create/update, valid/invalid token checks, enable/disable status, one five-minute job, daily housekeeping and restricted grants. No HTTP dispatch or email sent.' as result;
rollback;
