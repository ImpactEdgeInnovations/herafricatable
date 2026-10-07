begin;
create function public.notify_admins_of_community_photo_report()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 for recipient in
  select distinct r.user_id from public.user_roles r
  join public.profiles p on p.id=r.user_id
  where r.role in ('super_admin','moderator')
   and (r.expires_at is null or r.expires_at>now()) and p.access_status='active'
 loop
  -- No photo, caption, reporter identity or complaint text in email payloads.
  perform public.enqueue_notification(recipient,'system','A Community photo needs review',
   'A Community photo has been reported. Open Safety to review it privately.',
   '/admin/operations?area=safety-work#community-moderation',
   'community-photo-report:'||new.id::text||':'||recipient::text);
 end loop;
 return new;
end;
$$;
revoke all on function public.notify_admins_of_community_photo_report() from public,anon,authenticated;
create trigger notify_admins_of_community_photo_report_trigger
 after insert on public.community_photo_reports
 for each row execute function public.notify_admins_of_community_photo_report();
comment on function public.notify_admins_of_community_photo_report() is
 'Queues deduplicated private safety alerts for active, unexpired Super Admin/moderator roles through the existing in-app and email delivery engine.';
commit;
