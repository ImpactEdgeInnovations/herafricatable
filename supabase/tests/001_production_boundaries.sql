begin;
create extension if not exists pgtap with schema extensions;
select plan(111);

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
insert into public.events(id,slug,title,format,status,starts_at,ends_at,registration_mode,created_by)values
 ('50000000-0000-4000-8000-000000000001','test-table-one','Test Table One','virtual','published',now()-interval '1 hour',now()+interval '2 hours','closed','10000000-0000-4000-8000-000000000001'),
 ('50000000-0000-4000-8000-000000000002','test-table-two','Test Table Two','virtual','published',now()-interval '1 hour',now()+interval '2 hours','closed','10000000-0000-4000-8000-000000000001'),
 ('50000000-0000-4000-8000-000000000003','test-past-table','Test Past Table','virtual','completed',now()-interval '2 days',now()-interval '1 day','closed','10000000-0000-4000-8000-000000000001');
insert into public.event_staff_scopes(user_id,event_id,granted_by)values
 ('10000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.event_memberships(event_id,user_id,status,confirmed_at)values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','confirmed',now()),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','confirmed',now()),
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','attended',now());
insert into public.marketplace_posts(id,author_id,post_type,category,title,body,delivery_mode,status)values
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','offer','mentorship','Test mentorship office hours','I can offer a focused thirty minute mentoring conversation.','online','published');
update public.feature_flags set enabled=true where key='communities';
insert into public.communities(id,slug,name,description,community_type,status,created_by)values
 ('70000000-0000-4000-8000-000000000001','test-official-community','Test Official Community','An official production boundary test community for active members.','official','published','10000000-0000-4000-8000-000000000001'),
 ('70000000-0000-4000-8000-000000000002','test-private-community','Test Private Community','A private production boundary test community requiring host approval.','private','published','10000000-0000-4000-8000-000000000001');
insert into public.community_memberships(community_id,user_id,role,status,joined_at)values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','active',now()),
 ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','owner','active',now()),
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','member','active',now());
insert into public.community_posts(id,community_id,author_id,body)values
 ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','A community post captured for report-scoped moderation testing.');
update public.feature_flags set enabled=true where key='learning';
insert into public.courses(id,slug,title,summary,description,instructor_name,access_type,price_minor,currency,payment_mode,status,created_by)values
 ('80000000-0000-4000-8000-000000000001','test-free-course','Test Free Course','A free course used for learning permission boundary tests.','A complete free course description used to verify enrollment and progress permissions.','Test Instructor','free',0,'KES','closed','published','10000000-0000-4000-8000-000000000001'),
 ('80000000-0000-4000-8000-000000000002','test-paid-course','Test Paid Course','A paid course using the shared order and entitlement engine.','A complete paid course description used to verify manual approval and fulfillment.','Test Instructor','purchase',250000,'KES','manual_review','published','10000000-0000-4000-8000-000000000001');
insert into public.course_lessons(id,course_id,title,lesson_type,content,status,sort_order)values
 ('81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','Test learning boundary lesson','text','Private lesson content for an enrolled member.','published',0);
update public.feature_flags set enabled=true where key='referrals';
insert into public.referral_campaigns(id,name,slug,description,status,max_referrals_per_member,created_by)values
 ('90000000-0000-4000-8000-000000000001','Test Vouched Invitations','test-vouched-invitations','A controlled referral campaign used for permission and attribution tests.','active',3,'10000000-0000-4000-8000-000000000001');
update public.feature_flags set enabled=true where key='memberships';
insert into public.membership_plans(id,slug,name,description,price_minor,currency,duration_months,grace_days,payment_mode,status,created_by)values
 ('91000000-0000-4000-8000-000000000001','test-membership','Test Membership','A controlled annual membership used for renewal and permission boundary tests.',1200000,'KES',12,14,'manual_review','published','10000000-0000-4000-8000-000000000001');
update public.feature_flags set enabled=true where key='circles';
insert into public.circle_cycles(id,slug,name,description,starts_at,ends_at,group_size,include_test_accounts,status,created_by)values
 ('92000000-0000-4000-8000-000000000001','test-circle-cycle','Test Circle Cycle','A deterministic member Circle cycle used for privacy and matching boundary tests.',now()+interval'1 day',now()+interval'30 days',3,true,'open','10000000-0000-4000-8000-000000000001');

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
select is((select count(*)from public.get_my_event_pass('50000000-0000-4000-8000-000000000001')),1::bigint,'confirmed member can issue own first event pass');
select is((select count(*)from public.get_my_event_pass('50000000-0000-4000-8000-000000000002')),1::bigint,'confirmed member can issue own second event pass');
select is((select count(*)from public.event_checkin_credentials),2::bigint,'member reads only own event credentials');
select throws_ok($$select *from public.list_event_checkins('50000000-0000-4000-8000-000000000001')$$,'P0001','Not authorized','member cannot list event check-in roster');
select is((select count(*)from public.list_marketplace_posts(null,null,null,24,0)),1::bigint,'active member discovers another active member marketplace post');
select lives_ok($$select public.save_marketplace_post(null,'ask','business','Need a packaging supplier introduction','I am looking for a trusted sustainable packaging supplier in Kenya.',null,'Nairobi','hybrid',now()+interval'7 days')$$,'active member can create a policy-validated ask');
select lives_ok($$select public.respond_to_marketplace_post('60000000-0000-4000-8000-000000000001','I would value a conversation about business growth.')$$,'member can privately respond to another member post');
select throws_ok($$select public.respond_to_marketplace_post('60000000-0000-4000-8000-000000000001','A second response should not create a duplicate.')$$,'P0001','You already responded to this post','duplicate marketplace response is rejected');
select is((select count(*)from public.marketplace_responses),1::bigint,'responder reads own private response only');
select lives_ok($$select public.report_marketplace_post('60000000-0000-4000-8000-000000000001','other','Test report for report-scoped moderation coverage.')$$,'active member can report a visible marketplace post');
select is((select count(*)from public.list_communities()),2::bigint,'active member lists published communities behind enabled flag');
select lives_ok($$select public.request_community_access('70000000-0000-4000-8000-000000000002')$$,'active member requests access to a private community');
select is((select status from public.community_memberships where community_id='70000000-0000-4000-8000-000000000002'and user_id='10000000-0000-4000-8000-000000000002'),'requested','private community request remains pending');
select throws_ok($$select *from public.list_community_posts('70000000-0000-4000-8000-000000000002',30,0)$$,'P0001','Active community membership required','pending member cannot read private community feed');
select lives_ok($$select public.request_community_access('70000000-0000-4000-8000-000000000001')$$,'active member joins an official community');
select lives_ok($$select public.create_community_post('70000000-0000-4000-8000-000000000001','A useful update shared only with this trusted community.')$$,'active community member creates a rate-limited post');
select lives_ok($$select public.report_community_post('71000000-0000-4000-8000-000000000001','other','Report-scoped community moderation boundary test.')$$,'community member reports a visible post with evidence');
select throws_ok($$select *from public.list_community_reports()$$,'P0001','Moderator role required','member cannot access community moderation evidence');
select throws_ok($$select public.set_feature_flag('communities',false)$$,'P0001','Super admin required','member cannot change a release gate');
select is((select count(*)from public.list_courses()),2::bigint,'active member reads the enabled published course catalog');
select lives_ok($$select public.enroll_in_course('80000000-0000-4000-8000-000000000001')$$,'active member enrolls in a free course');
select is((select count(*)from public.course_enrollments),1::bigint,'member reads only own course enrollment');
select lives_ok($$select public.save_lesson_progress('81000000-0000-4000-8000-000000000001',100,null)$$,'enrolled member completes an accessible lesson');
select is((select status from public.course_enrollments where course_id='80000000-0000-4000-8000-000000000001'),'completed','course completes when every published lesson is complete');
select lives_ok($$select public.create_course_order('80000000-0000-4000-8000-000000000002','TEST-COURSE-PAYMENT','Manual payment test')$$,'member creates a manual course order through the shared engine');
select is((select order_type from public.orders where order_type='course'limit 1),'course','course purchase is explicitly typed in shared orders');
select throws_ok($$select *from public.list_course_orders()$$,'P0001','Super admin required','member cannot list course purchase operations');
select throws_ok($$select public.save_course(null,'unauthorized-course','Unauthorized Course','An unauthorized test course summary.','An unauthorized course must never be created by a member.','Member A','free',null,0,'KES','closed','draft')$$,'P0001','Super admin required','member cannot create course content');
select lives_ok($$select public.create_vouched_referral('90000000-0000-4000-8000-000000000001','referred-member@test.invalid','Former colleague','I have worked closely with her and can vouch for her integrity and contribution.')$$,'active member submits a meaningful private vouch');
select is((select count(*)from public.list_my_referrals()),1::bigint,'member lists only own referral journey');
select is((select status from public.referral_invitations where referrer_id='10000000-0000-4000-8000-000000000002'),'pending_review','member referral cannot grant access before review');
select throws_ok($$select *from public.list_referrals_admin()$$,'P0001','Super admin required','member cannot access private referral review queue');
select throws_ok($$select public.review_vouched_referral((select id from public.referral_invitations limit 1),'approve','')$$,'P0001','Super admin required','member cannot approve own referral');
select is((select count(*)from public.list_membership_catalog()),1::bigint,'active member reads the enabled membership catalog');
select lives_ok($$select public.create_membership_order('91000000-0000-4000-8000-000000000001','TEST-MEMBERSHIP-PAYMENT','Manual payment boundary test')$$,'member creates a manual membership order');
select is((select order_type from public.orders where order_type='membership'limit 1),'membership','membership purchase is explicitly typed in shared orders');
select throws_ok($$select *from public.list_membership_orders()$$,'P0001','Super admin required','member cannot list membership payment operations');
select throws_ok($$select public.review_membership_order((select id from public.orders where order_type='membership'limit 1),'approve','')$$,'P0001','Super admin required','member cannot approve own membership order');
select is((select count(*)from public.list_circle_cycles()),1::bigint,'active member reads the enabled open Circle cycle');
select lives_ok($$select public.set_circle_opt_in('92000000-0000-4000-8000-000000000001',true,'Seeking a focused peer accountability cohort.')$$,'active member opts into a Circle cycle');
select throws_ok($$select public.run_circle_matching('92000000-0000-4000-8000-000000000001')$$,'P0001','Super admin required','member cannot run Circle matching');
select is((select count(*)from public.list_public_past_events(24,0)),1::bigint,'public-safe past event projection includes completed event');
select is((select count(*)from public.list_my_past_events()),1::bigint,'attendee lists own eligible past event');
select lives_ok($$select public.save_event_feedback('50000000-0000-4000-8000-000000000003',5,4,5,true,'The facilitated introductions were valuable.','Allow more time for table conversations.','A thoughtful room where meaningful professional connections began.','named')$$,'eligible attendee saves private feedback with named testimonial consent');
select is((select count(*)from public.event_feedback),1::bigint,'member reads own private event feedback');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((select count(*)from public.support_tickets),0::bigint,'event staff cannot read support tickets');
select throws_ok($$select *from public.list_admin_privacy_requests()$$,'P0001','Super admin required','event staff cannot list privacy queue');
select throws_ok($$select *from public.list_admin_notification_jobs()$$,'P0001','Super admin required','event staff cannot list delivery queue');
select is((select count(*)from public.event_checkin_credentials),1::bigint,'event staff reads credentials only for assigned event');
select is((select count(*)from public.list_event_checkins('50000000-0000-4000-8000-000000000001')),1::bigint,'event staff lists assigned event roster');
select throws_ok($$select *from public.list_event_checkins('50000000-0000-4000-8000-000000000002')$$,'P0001','Not authorized','event staff cannot list another event roster');
select is((select outcome from public.check_in_event_member('50000000-0000-4000-8000-000000000001',(select manual_code from public.event_checkin_credentials where event_id='50000000-0000-4000-8000-000000000001'),'manual','pgTAP')), 'checked_in','event staff checks member into assigned event');
select is((select outcome from public.check_in_event_member('50000000-0000-4000-8000-000000000001',(select manual_code from public.event_checkin_credentials where event_id='50000000-0000-4000-8000-000000000001'),'manual','pgTAP')), 'already_checked_in','duplicate scan is idempotent');
select lives_ok($$select public.reverse_event_checkin((select id from public.event_checkins where event_id='50000000-0000-4000-8000-000000000001'and reversed_at is null),'Incorrect door scan')$$,'event staff can auditably reverse assigned event check-in');
select is((select status from public.event_memberships where event_id='50000000-0000-4000-8000-000000000001'and user_id='10000000-0000-4000-8000-000000000002'),'confirmed','reversal restores confirmed attendance state');
select throws_ok($$select *from public.list_marketplace_reports()$$,'P0001','Moderator role required','event staff cannot access marketplace moderation reports');
select throws_ok($$select *from public.list_community_reports()$$,'P0001','Moderator role required','event staff cannot access community moderation reports');
select throws_ok($$select *from public.list_course_orders()$$,'P0001','Super admin required','event staff cannot access course purchase operations');
select throws_ok($$select *from public.list_referrals_admin()$$,'P0001','Super admin required','event staff cannot access referral review queue');
select throws_ok($$select *from public.list_membership_orders()$$,'P0001','Super admin required','event staff cannot access membership operations');
select lives_ok($$select public.set_circle_opt_in('92000000-0000-4000-8000-000000000001',true,'Staff identity participates only as an active member.')$$,'event staff may opt in only through the member path');
select throws_ok($$select *from public.list_event_feedback_admin('50000000-0000-4000-8000-000000000003')$$,'P0001','Not authorized','event staff cannot read feedback outside assigned event scope');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)from public.list_marketplace_responses('60000000-0000-4000-8000-000000000001')),1::bigint,'post owner reads private responses to own post');
select lives_ok($$select public.review_marketplace_response((select id from public.marketplace_responses where post_id='60000000-0000-4000-8000-000000000001'),'accepted')$$,'post owner can accept a private response');
select throws_ok($$select public.save_event_feedback('50000000-0000-4000-8000-000000000003',5,5,5,true,'Not eligible for this event feedback.','No improvement note.',null,'none')$$,'P0001','Confirmed event attendance required','non-attendee cannot submit event feedback');
select lives_ok($$select public.set_circle_opt_in('92000000-0000-4000-8000-000000000001',true,'Seeking complementary expertise and mutual accountability.')$$,'second active member opts into the Circle cycle');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)from public.support_tickets),2::bigint,'super admin reads support tickets');
select is((select count(*)from public.list_admin_privacy_requests()),2::bigint,'super admin lists privacy requests');
select ok((select count(*)from public.list_admin_notification_jobs())>=2,'super admin lists notification jobs');
select is((select count(*)from public.list_marketplace_reports()),1::bigint,'super admin receives report snapshot through scoped moderation operation');
select is((select count(*)from public.list_community_reports()),1::bigint,'super admin receives only reported community evidence');
select lives_ok($$select public.review_community_report((select id from public.community_post_reports limit 1),'hide','Reported post removed after boundary test review.')$$,'super admin resolves community report and hides source post');
select lives_ok($$select public.invite_community_member('70000000-0000-4000-8000-000000000002','staff@test.invalid','moderator')$$,'super admin invites an active member into a private community role');
select is((select status from public.community_memberships where community_id='70000000-0000-4000-8000-000000000002'and user_id='10000000-0000-4000-8000-000000000004'),'invited','community invitation remains consent-based until accepted');
select is((select count(*)from public.list_course_orders()),1::bigint,'super admin lists the pending course order');
select lives_ok($$select public.review_course_order((select id from public.orders where order_type='course'limit 1),'approve','Verified manual payment during boundary test.')$$,'super admin approves and fulfills a manual course purchase');
select is((select count(*)from public.course_enrollments where course_id='80000000-0000-4000-8000-000000000002'and status='active'),1::bigint,'approved course order grants one active enrollment');
select is((select count(*)from public.list_referrals_admin()),1::bigint,'super admin receives the private vouched referral queue');
select lives_ok($$select public.review_vouched_referral((select id from public.referral_invitations limit 1),'approve','Vouch reviewed against member history.')$$,'super admin approval creates onboarding eligibility');
select is((select status from public.beta_invites where email='referred-member@test.invalid'),'pending','approved referral creates a pending beta invite');
select is((select count(*)from public.notification_jobs where template_key='referral_invitation'and to_email='referred-member@test.invalid'),1::bigint,'approved referral queues one invitation email');
select is((select count(*)from public.list_membership_orders()),1::bigint,'super admin lists the pending membership order');
select lives_ok($$select public.review_membership_order((select id from public.orders where order_type='membership'limit 1),'approve','Verified manual membership payment.')$$,'super admin approves and fulfills a membership purchase');
select is((select count(*)from public.membership_periods where user_id='10000000-0000-4000-8000-000000000002'and status='active'),1::bigint,'approved membership order grants one active term');
select lives_ok($$select public.mark_test_account('10000000-0000-4000-8000-000000000003','Tagged Test Member')$$,'super admin explicitly tags a production test identity');
select is((select is_test_account from public.profiles where id='10000000-0000-4000-8000-000000000003'),true,'test identity remains distinguishable from real members');
select lives_ok($$select public.run_circle_matching('92000000-0000-4000-8000-000000000001')$$,'super admin runs deterministic Circle matching');
select is((select count(*)from public.circles where cycle_id='92000000-0000-4000-8000-000000000001'),1::bigint,'matching creates one balanced draft Circle');
select is((select count(*)from public.list_circle_participants_admin('92000000-0000-4000-8000-000000000001')),3::bigint,'super admin reviews every deterministic assignment');
select lives_ok($$select public.publish_circle_cycle('92000000-0000-4000-8000-000000000001')$$,'super admin deliberately publishes reviewed Circles');
select is((select status from public.circle_cycles where id='92000000-0000-4000-8000-000000000001'),'published','published cycle state is explicit');
select lives_ok($$select public.publish_circle_prompt('92000000-0000-4000-8000-000000000001','The first commitment','Share one concrete outcome you will move forward before this Circle closes.',now(),now()+interval'14 days')$$,'super admin publishes one guided prompt per Circle');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)from public.list_my_circles()),1::bigint,'assigned member enters only her published Circle');
select is((select count(*)from public.list_circle_members((select id from public.circles where cycle_id='92000000-0000-4000-8000-000000000001'limit 1))),3::bigint,'Circle member sees the blocked-safe cohort roster');
select lives_ok($$select public.save_circle_response((select id from public.circle_prompts limit 1),'I will secure two qualified partner conversations before our next reflection.')$$,'Circle member shares a private cohort reflection');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

set local role postgres;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)values('90000000-0000-4000-8000-000000000002','referred-member@test.invalid','authenticated','authenticated','{}','{}',now());
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select status from public.referral_invitations where invitee_email='referred-member@test.invalid'),'claimed','accepted auth invite links referral attribution to the new identity');
set local role postgres;
update public.profiles set access_status='active'where id='90000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select status from public.referral_invitations where invitee_email='referred-member@test.invalid'),'activated','member activation closes the referral conversion lifecycle');
select lives_ok($$select public.save_event_recap('50000000-0000-4000-8000-000000000003','A test table remembered','A detailed public-safe recap of the completed test gathering.',array['Introductions across industries','A shared commitment to follow through'],'published')$$,'super admin publishes a scoped event recap');
select is((select count(*)from public.list_event_feedback_admin('50000000-0000-4000-8000-000000000003')),1::bigint,'super admin reads private feedback through scoped operation');
select is((select response_count from public.get_event_feedback_summary('50000000-0000-4000-8000-000000000003')),1::bigint,'feedback aggregate reports one response');
select lives_ok($$select public.review_event_feedback((select id from public.event_feedback where event_id='50000000-0000-4000-8000-000000000003'),'approve_testimonial','')$$,'super admin approves consented testimonial');
select is((select count(*)from public.list_event_testimonials('50000000-0000-4000-8000-000000000003')),1::bigint,'approved consented testimonial enters public-safe projection');

select *from finish();
rollback;
