begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
values
 ('10000000-0000-4000-8000-000000000001','admin@test.invalid','authenticated','authenticated','{}','{}',now()),
 ('10000000-0000-4000-8000-000000000002','member-a@test.invalid','authenticated','authenticated','{}','{}',now()),
 ('10000000-0000-4000-8000-000000000003','member-b@test.invalid','authenticated','authenticated','{}','{}',now()),
 ('10000000-0000-4000-8000-000000000004','staff@test.invalid','authenticated','authenticated','{}','{}',now());
update public.profiles set access_status='active',display_name=case id
 when'10000000-0000-4000-8000-000000000001'then'Admin'
 when'10000000-0000-4000-8000-000000000002'then'Member A'
 when'10000000-0000-4000-8000-000000000003'then'Member B'else'Staff'end;
insert into public.user_roles(user_id,role,granted_by)values
 ('10000000-0000-4000-8000-000000000001','super_admin','10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000004','event_staff','10000000-0000-4000-8000-000000000001');
insert into public.support_tickets(id,requester_id,category,subject,description)values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','account','Member A request','Private support details for member A.'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','privacy','Member B request','Private support details for member B.');
insert into public.support_messages(ticket_id,author_id,body,is_staff)values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Member A private reply',false),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Member B private reply',false);
insert into public.privacy_requests(id,user_id,request_type,reason)values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','correction','Member A correction'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','restriction','Member B restriction');
insert into public.notifications(id,user_id,kind,title,body,dedupe_key)values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','system','Member A notice','Only member A can read this.','test:a'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','system','Member B notice','Only member B can read this.','test:b');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)from public.support_tickets),1::bigint,'member reads only own support ticket');
select is((select subject from public.support_tickets limit 1),'Member A request','member support row is the correct owner row');
select is((select count(*)from public.support_messages),1::bigint,'member reads only replies on own support ticket');
select is((select count(*)from public.privacy_requests),1::bigint,'member reads only own privacy requests');
select is((select count(*)from public.notifications),1::bigint,'member reads only own notifications');
select lives_ok($$select public.mark_notification_read('40000000-0000-4000-8000-000000000001')$$,'member may mark own notification read');
select throws_ok($$select public.mark_notification_read('40000000-0000-4000-8000-000000000002')$$,'P0001','Notification not found','member cannot mutate another notification');
select throws_ok($$select *from public.list_admin_support_tickets()$$,'P0001','Super admin required','member cannot list admin support queue');
select throws_ok($$select *from public.claim_notification_jobs(10)$$,'P0001','Service role required','member cannot claim email jobs');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((select count(*)from public.support_tickets),0::bigint,'event staff cannot read support tickets');
select throws_ok($$select *from public.list_admin_privacy_requests()$$,'P0001','Super admin required','event staff cannot list privacy queue');
select throws_ok($$select *from public.list_admin_notification_jobs()$$,'P0001','Super admin required','event staff cannot list delivery queue');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)from public.support_tickets),2::bigint,'super admin reads support tickets');
select is((select count(*)from public.list_admin_privacy_requests()),2::bigint,'super admin lists privacy requests');
select ok((select count(*)from public.list_admin_notification_jobs())>=2,'super admin lists notification jobs');

select *from finish();
rollback;
