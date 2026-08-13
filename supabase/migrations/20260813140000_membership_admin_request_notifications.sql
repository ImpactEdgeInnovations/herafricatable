begin;

create or replace function public.notify_admins_of_membership_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid;
  request_key text;
  applicant_name text := coalesce(nullif(trim(new.display_name), ''), 'A new applicant');
begin
  if new.status <> 'submitted' then return new; end if;
  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.submitted_at is not distinct from new.submitted_at then
    return new;
  end if;

  request_key := 'membership-application-submitted:' || new.user_id || ':' ||
    floor(extract(epoch from new.submitted_at) * 1000000)::bigint;

  for admin_id in
    select distinct assignment.user_id
    from public.user_roles assignment
    join public.profiles profile on profile.id = assignment.user_id
    where assignment.role = 'super_admin'
      and (assignment.expires_at is null or assignment.expires_at > now())
      and profile.access_status <> 'deleted'
  loop
    perform public.enqueue_notification(
      admin_id,
      'system',
      'New membership request',
      applicant_name || ' submitted a membership request and is waiting for private review.',
      '/admin/members',
      request_key || ':' || admin_id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_admins_of_membership_request_trigger
  on public.membership_applications;
create trigger notify_admins_of_membership_request_trigger
after insert or update of status, submitted_at on public.membership_applications
for each row execute function public.notify_admins_of_membership_request();

revoke all on function public.notify_admins_of_membership_request() from public;

comment on function public.notify_admins_of_membership_request is
  'Queues a deduplicated in-app and Resend email notification to every active Super Admin auth email when a manual membership request is submitted or resubmitted.';

commit;
