begin;

create or replace function public.notify_member_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_name text := nullif(split_part(trim(coalesce(new.display_name, '')), ' ', 1), '');
  welcome_key text := 'member-approved:' || new.id;
begin
  if old.access_status = 'pending'
    and new.access_status in ('onboarding', 'active') then
    perform public.enqueue_notification(
      new.id,
      'system',
      case
        when first_name is not null then 'Welcome, ' || first_name
        else 'Welcome to Her Africa Table'
      end,
      case
        when new.access_status = 'onboarding'
          then 'Your membership request has been approved. Complete your profile so we can make your introductions, Communities and event suggestions more relevant.'
        else 'Your membership is active. Your Member Home will help you find the people, conversations and events that matter to you.'
      end,
      case when new.access_status = 'onboarding' then '/onboarding' else '/home' end,
      welcome_key
    );

    update public.notification_jobs job
    set template_key = 'member_welcome'
    where job.user_id = new.id
      and job.dedupe_key = welcome_key
      and job.status = 'queued';
  end if;
  return new;
end;
$$;

revoke all on function public.notify_member_approval() from public;

comment on function public.notify_member_approval is
  'Queues one personalised membership welcome for a newly approved member; delivery remains retryable through the notification worker.';

commit;
