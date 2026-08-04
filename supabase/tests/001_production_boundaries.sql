begin;
create extension if not exists pgtap with schema extensions;
select plan(281);

insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
values
 ('10000000-0000-4000-8000-000000000001','admin@test.invalid','authenticated','authenticated','{}','{}',now()),
 ('10000000-0000-4000-8000-000000000002','member-a@test.invalid','authenticated','authenticated','{}','{}',now()),
 ('10000000-0000-4000-8000-000000000003','member-b@test.invalid','authenticated','authenticated','{}','{}',now()),
 ('10000000-0000-4000-8000-000000000004','staff@test.invalid','authenticated','authenticated','{}','{}',now());
update public.profiles set
 access_status='active',
 display_name=case id
 when'10000000-0000-4000-8000-000000000001'then'Admin'
 when'10000000-0000-4000-8000-000000000002'then'Member A'
 when'10000000-0000-4000-8000-000000000003'then'Member B'else'Staff'end,
 job_title='Founder',
 company=case when id='10000000-0000-4000-8000-000000000003'then'Member B Studio'else'Test Enterprise'end,
 industry='Technology',
 country='Kenya',
 city='Nairobi',
 languages=array['English'],
 bio='A complete profile used to verify production member boundaries.',
 avatar_path=id::text||'/profile',
 profile_completion=100;
insert into public.profile_interests(user_id,interest)values
 ('10000000-0000-4000-8000-000000000002','Entrepreneurship'),
 ('10000000-0000-4000-8000-000000000003','Entrepreneurship');
insert into public.member_goals(user_id,goal_key)values
 ('10000000-0000-4000-8000-000000000002','build_business'),
 ('10000000-0000-4000-8000-000000000003','build_business');
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
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','confirmed',now()),
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','attended',now());
insert into public.event_attendee_preferences(event_id,user_id,discoverable,show_company,introduction)values
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',true,true,'I would enjoy meeting women building trusted regional businesses.');
insert into public.marketplace_posts(id,author_id,post_type,category,title,body,delivery_mode,status)values
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','offer','mentorship','Test mentorship office hours','I can offer a focused thirty minute mentoring conversation.','online','published');
alter table public.feature_flags disable trigger enforce_module_release_acceptance_before_update;
alter table public.communities disable trigger enforce_community_publish_acceptance_before_insert;
alter table public.communities disable trigger enforce_community_publish_acceptance_before_update;
update public.feature_flags set enabled=true where key='communities';
insert into public.communities(id,slug,name,description,community_type,status,created_by)values
 ('70000000-0000-4000-8000-000000000001','test-official-community','Test Official Community','An official production boundary test community for active members.','official','published','10000000-0000-4000-8000-000000000001'),
 ('70000000-0000-4000-8000-000000000002','test-private-community','Test Private Community','A private production boundary test community requiring host approval.','private','published','10000000-0000-4000-8000-000000000001'),
 ('70000000-0000-4000-8000-000000000003','test-offboarding-community','Test Offboarding Community','A controlled draft room used to prove host transition and record-preservation boundaries.','private','draft','10000000-0000-4000-8000-000000000001');
insert into public.community_memberships(community_id,user_id,role,status,joined_at)values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','active',now()),
 ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','owner','active',now()),
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','member','active',now()),
 ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','owner','active',now()),
 ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','moderator','active',now()),
 ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','member','active',now());
insert into public.community_cohorts(community_id,event_id,eligibility_scope,status,welcome_message,introduction_prompt,follow_up_until,created_by)values
 ('70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','confirmed_event','active','A private cohort boundary used to prove that eligibility and accepted room access remain separate permissions.','Share who you are, what you are building, what you can offer and what you are seeking from this cohort.',now()+interval'60 days','10000000-0000-4000-8000-000000000001');
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
update public.feature_flags set enabled=true where key='partner_perks';
insert into public.partners(id,slug,name,description,category,city,country,status,created_by)values
 ('93000000-0000-4000-8000-000000000001','test-partner','Test Partner','A reviewed partner used for private redemption and inventory boundary tests.','Business services','Nairobi','Kenya','active','10000000-0000-4000-8000-000000000001');
insert into public.partner_perks(id,partner_id,slug,title,description,terms,inventory_total,per_member_limit,reservation_days,starts_at,ends_at,status,created_by)values
 ('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','test-member-benefit','Test Member Benefit','A limited partner benefit reserved through the production-safe member workflow.','One reservation per active member. Present the private code before expiry.',1,1,7,now()-interval'1 day',now()+interval'30 days','published','10000000-0000-4000-8000-000000000001');
alter table public.feature_flags enable trigger enforce_module_release_acceptance_before_update;
alter table public.communities enable trigger enforce_community_publish_acceptance_before_insert;
alter table public.communities enable trigger enforce_community_publish_acceptance_before_update;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)from public.support_tickets),1::bigint,'member reads only own support ticket');
select is((select subject from public.support_tickets limit 1),'Member A request','member support row is the correct owner row');
select is((select count(*)from public.support_messages),1::bigint,'member reads only replies on own support ticket');
select is((select count(*)from public.privacy_requests),1::bigint,'member reads only own privacy requests');
select is((select count(*)from public.notifications),2::bigint,'member reads only own notification and approval welcome');
select lives_ok($$select public.mark_notification_read('40000000-0000-4000-8000-000000000001')$$,'member may mark own notification read');
select throws_ok($$select public.mark_notification_read('40000000-0000-4000-8000-000000000002')$$,'P0001','Notification not found','member cannot mutate another notification');
select throws_ok($$select *from public.list_admin_support_tickets()$$,'P0001','Super admin required','member cannot list admin support queue');
select throws_ok($$select *from public.claim_notification_jobs(10)$$,'P0001','Service role required','member cannot claim email jobs');
select lives_ok($$select public.update_member_profile('Member A','Managing Director','Test Enterprise','Technology','Kenya','Nairobi',array['English','Kiswahili'],'A complete profile updated through the active member editor.','Test Enterprise','https://example.test',null,'+254700000001','+254700000001','https://linkedin.example/member-a',null,true,array['Entrepreneurship','Trade'],array['build_business','mentor'])$$,'active member updates her complete profile through the audited editor');
select is((select job_title from public.profiles where id='10000000-0000-4000-8000-000000000002'),'Managing Director','profile update persists public professional context');
select is((select count(*)from public.list_event_attendee_directory('50000000-0000-4000-8000-000000000002',30,0)),1::bigint,'confirmed guest discovers an opted-in guest at the same event');
select is((select company from public.list_event_attendee_directory('50000000-0000-4000-8000-000000000002',30,0)limit 1),'Member B Studio','attendee controls may deliberately include public company context');
select is((select connection_status from public.list_event_attendee_directory('50000000-0000-4000-8000-000000000002',30,0)limit 1),null::text,'attendee discovery returns only relationship state before a request');
select is((select count(*)from public.event_attendee_preferences),0::bigint,'member cannot directly read another guest discovery preference');
select lives_ok($$select public.save_event_attendee_visibility('50000000-0000-4000-8000-000000000002',true,true,'I am open to thoughtful conversations about regional growth.')$$,'confirmed guest deliberately opts into event discovery');
select is((select discoverable from public.event_attendee_preferences where event_id='50000000-0000-4000-8000-000000000002'),true,'member reads only her own persisted event preference');
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
select throws_ok($$select *from public.get_community_cohort('70000000-0000-4000-8000-000000000002')$$,'P0001','Active community membership required','pending member cannot read private cohort controls');
select lives_ok($$select public.manage_my_community_membership('70000000-0000-4000-8000-000000000002','cancel_request')$$,'member cancels her own pending community request');
select is((select status from public.community_memberships where community_id='70000000-0000-4000-8000-000000000002'and user_id='10000000-0000-4000-8000-000000000002'),'declined','cancelled request becomes a rejoinable declined membership');
select throws_ok($$select *from public.list_cohort_overview()$$,'P0001','Super admin required','member cannot read cohort operations overview');
select throws_ok($$select *from public.list_cohort_health('70000000-0000-4000-8000-000000000002')$$,'P0001','Super admin required','member cannot read cohort health identities');
select throws_ok($$select public.sync_cohort_invitations('70000000-0000-4000-8000-000000000002')$$,'P0001','Super admin required','member cannot issue cohort invitations');
select lives_ok($$select public.request_community_access('70000000-0000-4000-8000-000000000001')$$,'active member joins an official community');
select lives_ok($$select public.create_community_post('70000000-0000-4000-8000-000000000001','A useful update shared only with this trusted community.')$$,'active community member creates a rate-limited post');
select lives_ok($$select public.report_community_post('71000000-0000-4000-8000-000000000001','other','Report-scoped community moderation boundary test.')$$,'community member reports a visible post with evidence');
select lives_ok($$select public.manage_my_community_membership('70000000-0000-4000-8000-000000000001','leave')$$,'ordinary member leaves a community without deleting content');
select is((select status from public.community_memberships where community_id='70000000-0000-4000-8000-000000000001'and user_id='10000000-0000-4000-8000-000000000002'),'removed','departed member loses active room access');
select throws_ok($$select *from public.list_community_posts('70000000-0000-4000-8000-000000000001',30,0)$$,'P0001','Active community membership required','departed member cannot read the private feed');
select lives_ok($$select public.request_community_access('70000000-0000-4000-8000-000000000001')$$,'departed member may deliberately rejoin an open community');
select is((select status from public.community_memberships where community_id='70000000-0000-4000-8000-000000000001'and user_id='10000000-0000-4000-8000-000000000002'),'active','successful rejoin restores active membership');
select is((select count(*)from public.list_community_posts('70000000-0000-4000-8000-000000000001',30,0)where body='A useful update shared only with this trusted community.'),1::bigint,'member content remains available after leave and rejoin');
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
select is((select count(*)from public.list_partner_perks()),1::bigint,'active member reads the enabled partner benefit catalog');
select lives_ok($$select *from public.reserve_partner_perk('94000000-0000-4000-8000-000000000001')$$,'active member atomically reserves available partner inventory');
select is((select count(*)from public.perk_redemptions),1::bigint,'member reads only her private redemption record');
select throws_ok($$select *from public.reserve_partner_perk('94000000-0000-4000-8000-000000000001')$$,'P0001','Member redemption limit reached','single-use member limit prevents duplicate reservation');
select throws_ok($$select *from public.list_perk_redemptions_admin()$$,'P0001','Super admin required','member cannot access the redemption ledger');
select is((select count(*)from public.product_events),0::bigint,'member cannot read raw privacy-safe analytics events');
select throws_ok($$select *from public.get_product_analytics(30)$$,'P0001','Super admin required','member cannot read aggregate product analytics');
select throws_ok($$select *from public.get_launch_readiness_metrics()$$,'P0001','Super admin required','member cannot read operational readiness metrics');
select is((select count(*)from public.launch_gate_checks),0::bigint,'member cannot directly read launch gate evidence');
select throws_ok($$select *from public.list_launch_gate_checks()$$,'P0001','Super admin required','member cannot list launch gate evidence');
select throws_ok($$select public.save_launch_gate_check('member_email_otp','passed',null,'A member must not be able to close a production launch gate.')$$,'P0001','Super admin required','member cannot update a launch gate');
select is((select count(*)from public.get_member_profile('10000000-0000-4000-8000-000000000003')),1::bigint,'active member can open another visible active member profile');
select is((select phone from public.get_member_profile('10000000-0000-4000-8000-000000000003')),null::text,'member profile keeps private phone hidden before mutual acceptance');
select throws_ok($$select *from public.get_member_profile('10000000-0000-4000-8000-000000000002')$$,'P0001','Member is unavailable','member profile view does not duplicate the own-profile editor');
select throws_ok($$select public.request_connection_with_context('10000000-0000-4000-8000-000000000003',null,'Too short')$$,'P0001','An introduction must be between 10 and 500 characters','connection context rejects an unhelpfully short note');
select is((select count(*)from public.list_member_recommendations(6)),3::bigint,'active member receives every eligible unconnected visible recommendation');
select is((select match_score from public.list_member_recommendations(6)limit 1),12,'recommendation score reflects shared goal, interest, city and industry');
select ok((select shared_goals from public.list_member_recommendations(6)limit 1)@>array['build_business'],'recommendation exposes the public shared goal used for matching');
select ok((select match_reasons from public.list_member_recommendations(6)limit 1)@>array['Also in Nairobi'],'recommendation explains its location reason in plain language');
select lives_ok($$select public.save_member_profile('10000000-0000-4000-8000-000000000003','Revisit before the Nairobi event to discuss regional distribution.')$$,'member privately saves a relevant profile for later');
select is(public.is_member_profile_saved('10000000-0000-4000-8000-000000000003'),true,'saved-profile state is available to the owning member');
select is((select private_note from public.list_my_saved_profiles()limit 1),'Revisit before the Nairobi event to discuss regional distribution.','owner can read her private saved-profile reminder');
select lives_ok($$select public.remove_saved_member_profile('10000000-0000-4000-8000-000000000003')$$,'member can return a saved profile to active recommendations');
select is((select count(*)from public.list_member_recommendations(6)),3::bigint,'removing a saved profile makes that eligible recommendation available again');
select lives_ok($$select public.request_connection_with_context('10000000-0000-4000-8000-000000000003',null,'I would value comparing notes on growing a trusted regional business.')$$,'active member sends a purposeful private introduction');
select is((select count(*)from public.list_member_recommendations(6)),2::bigint,'existing connection journeys are excluded without hiding other eligible recommendations');
select lives_ok($$select public.save_member_profile('10000000-0000-4000-8000-000000000003','Revisit before the Nairobi event to discuss regional distribution.')$$,'member may keep a private reminder after beginning a connection journey');
select is((select introduction_note from public.list_my_network_with_context()limit 1),'I would value comparing notes on growing a trusted regional business.','requester sees her own private introduction context');
select is((select count(*)from public.list_public_past_events(24,0)),1::bigint,'public-safe past event projection includes completed event');
select is((select count(*)from public.list_my_past_events()),1::bigint,'attendee lists own eligible past event');
select lives_ok($$select public.save_event_feedback('50000000-0000-4000-8000-000000000003',5,4,5,true,'The facilitated introductions were valuable.','Allow more time for table conversations.','A thoughtful room where meaningful professional connections began.','named')$$,'eligible attendee saves private feedback with named testimonial consent');
select is((select count(*)from public.event_feedback),1::bigint,'member reads own private event feedback');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((select count(*)from public.support_tickets),0::bigint,'event staff cannot read support tickets');
select throws_ok($$select *from public.list_admin_privacy_requests()$$,'P0001','Super admin required','event staff cannot list privacy queue');
select throws_ok($$select *from public.list_admin_notification_jobs()$$,'P0001','Super admin required','event staff cannot list delivery queue');
select throws_ok($$select *from public.list_event_attendee_directory('50000000-0000-4000-8000-000000000002',30,0)$$,'P0001','Confirmed event attendance required','non-attendee staff cannot list a private event attendee directory');
select throws_ok($$select public.save_event_attendee_visibility('50000000-0000-4000-8000-000000000002',true,true,'This identity is not an attendee.')$$,'P0001','Confirmed event attendance required','non-attendee staff cannot opt into event discovery');
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
select throws_ok($$select *from public.list_perk_redemptions_admin()$$,'P0001','Super admin required','event staff cannot access partner redemption operations');
select throws_ok($$select *from public.get_product_analytics(30)$$,'P0001','Super admin required','event staff cannot access product analytics');
select throws_ok($$select *from public.get_launch_readiness_metrics()$$,'P0001','Super admin required','event staff cannot access launch readiness');
select throws_ok($$select *from public.list_launch_gate_checks()$$,'P0001','Super admin required','event staff cannot access launch evidence');
select throws_ok($$select *from public.list_event_feedback_admin('50000000-0000-4000-8000-000000000003')$$,'P0001','Not authorized','event staff cannot read feedback outside assigned event scope');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)from public.member_saved_profiles),0::bigint,'another member cannot read a private saved-profile shortlist');
select is((select introduction_note from public.list_my_network_with_context()where direction='incoming'limit 1),'I would value comparing notes on growing a trusted regional business.','recipient sees the private introduction before deciding');
select lives_ok($$select public.respond_to_connection((select connection_id from public.list_my_network_with_context()where direction='incoming'limit 1),'accept')$$,'recipient deliberately accepts the contextual connection request');
select is((select count(*)from public.list_marketplace_responses('60000000-0000-4000-8000-000000000001')),1::bigint,'post owner reads private responses to own post');
select lives_ok($$select public.review_marketplace_response((select id from public.marketplace_responses where post_id='60000000-0000-4000-8000-000000000001'),'accepted')$$,'post owner can accept a private response');
select throws_ok($$select public.save_event_feedback('50000000-0000-4000-8000-000000000003',5,5,5,true,'Not eligible for this event feedback.','No improvement note.',null,'none')$$,'P0001','Confirmed event attendance required','non-attendee cannot submit event feedback');
select lives_ok($$select public.set_circle_opt_in('92000000-0000-4000-8000-000000000001',true,'Seeking complementary expertise and mutual accountability.')$$,'second active member opts into the Circle cycle');
select is((select count(*)from public.perk_redemptions),0::bigint,'another member cannot read a private redemption code');
select is((select count(*)from public.list_partner_perks()),1::bigint,'another active member sees the catalog without another member code');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.manage_community_lifecycle('70000000-0000-4000-8000-000000000003','pause','Host unavailable during the controlled offboarding test.',null)$$,'super admin pauses a community while preserving its records');
select is((select status from public.community_memberships where community_id='70000000-0000-4000-8000-000000000003'and role='owner'),'suspended','paused community removes the unavailable owner from host controls');
select is((select status from public.community_memberships where community_id='70000000-0000-4000-8000-000000000003'and user_id='10000000-0000-4000-8000-000000000003'),'paused','ordinary member access is preserved but unavailable during transition');
select lives_ok($$select public.manage_community_lifecycle('70000000-0000-4000-8000-000000000003','replace_host','Backup moderator assumes accountable ownership after review.',(select id from public.community_memberships where community_id='70000000-0000-4000-8000-000000000003'and user_id='10000000-0000-4000-8000-000000000004'))$$,'super admin appoints the reviewed backup moderator as successor');
select is((select role from public.community_memberships where community_id='70000000-0000-4000-8000-000000000003'and user_id='10000000-0000-4000-8000-000000000004'),'owner','successor receives the single active owner role');
select lives_ok($$select public.manage_community_lifecycle('70000000-0000-4000-8000-000000000003','close','Controlled test closure preserves Community and financial records.',null)$$,'super admin closes a community without deleting member content');
select is((select status from public.communities where id='70000000-0000-4000-8000-000000000003'),'archived','closed Community remains archived for retention and audit');
select is((select count(*)from public.member_saved_profiles),0::bigint,'super admin cannot browse member saved-profile notes');
select is((select count(*)from public.support_tickets),2::bigint,'super admin reads support tickets');
select is((select count(*)from public.list_admin_privacy_requests()),2::bigint,'super admin lists privacy requests');
select ok((select count(*)from public.list_admin_notification_jobs())>=2,'super admin lists notification jobs');
select is((select count(*)from public.list_marketplace_reports()),1::bigint,'super admin receives report snapshot through scoped moderation operation');
select is((select count(*)from public.list_community_reports()),1::bigint,'super admin receives only reported community evidence');
select lives_ok($$select public.review_community_report((select report_id from public.list_community_reports()limit 1),'hide','Reported post removed after boundary test review.')$$,'super admin resolves community report through the authorized moderation projection');
select lives_ok($$select public.invite_community_member('70000000-0000-4000-8000-000000000002','staff@test.invalid','moderator')$$,'super admin invites an active member into a private community role');
select is((select status from public.community_memberships where community_id='70000000-0000-4000-8000-000000000002'and user_id='10000000-0000-4000-8000-000000000004'),'invited','community invitation remains consent-based until accepted');
select lives_ok($$select public.ensure_founding_cohort('50000000-0000-4000-8000-000000000001')$$,'super admin prepares the event-linked founding room');
select is((select public.sync_cohort_invitations((select id from public.communities where slug='founding-table-nairobi'))),1,'eligibility sync creates one consent-based guest invitation');
select is((select status from public.community_memberships where community_id=(select id from public.communities where slug='founding-table-nairobi')and user_id='10000000-0000-4000-8000-000000000002'),'invited','eligible attendee remains invited until she accepts');
select is((select count(*)from public.list_cohort_overview()where community_slug='founding-table-nairobi'),1::bigint,'super admin sees the founding room in cohort operations');
select is((select count(*)from public.list_cohort_health((select id from public.communities where slug='founding-table-nairobi'))),1::bigint,'cohort health lists the invited attendee without unrelated active members');
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
select is((select count(*)from public.list_perk_redemptions_admin()),1::bigint,'super admin reconciles the complete redemption ledger');
select lives_ok($$select public.review_perk_redemption((select id from public.perk_redemptions limit 1),'redeem','Partner confirmed the benefit was delivered.')$$,'super admin marks a verified code redeemed');
select is((select status from public.perk_redemptions limit 1),'redeemed','redemption lifecycle records final delivery state');
select is((select count(*)from public.get_launch_readiness_metrics()),10::bigint,'super admin receives every configured readiness gate');
select is((select count(*)from public.list_launch_gate_checks()),12::bigint,'super admin receives every required operational launch gate');
select throws_ok($$select public.save_launch_gate_check('member_email_otp','passed','Operations lead','Too short')$$,'P0001','Passed checks require concise evidence','launch gates cannot pass without useful evidence');
select lives_ok($$select public.save_launch_gate_check('member_email_otp','passed','Operations lead','Production six-digit OTP received, verified and expiry recovery confirmed.')$$,'super admin records auditable launch evidence');
select is((select status from public.launch_gate_checks where check_key='member_email_otp'),'passed','launch gate status is persisted');
select is((select count(*)from public.audit_events where action='launch.gate_updated'and metadata->>'check_key'='member_email_otp'),1::bigint,'launch gate update creates an audit event without copying evidence');
select ok((select coalesce(sum(real_events),0)from public.get_product_analytics(30))>0,'server triggers produce aggregate real-member product activity');
select lives_ok($$select public.save_launch_readiness_target('real_active_members',11)$$,'super admin updates an auditable launch threshold');
select is((select target_value from public.launch_readiness_targets where metric_key='real_active_members'),11::bigint,'readiness threshold update is persisted');
select ok(not exists(select 1 from public.product_events where metadata?'body'or metadata?'email'or metadata?'search'),'product analytics metadata excludes content and direct identifiers');
select is((select count(*)from public.product_events where actor_id='10000000-0000-4000-8000-000000000003'and not is_test_event),0::bigint,'tagging an identity reclassifies its earlier events out of real metrics');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select lives_ok($$select public.create_support_ticket('technical','Test analytics boundary','A tagged test identity creates a support event for metric separation.')$$,'tagged test action is captured without entering real metrics');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select test_events from public.get_product_analytics(30)where event_name='support_requested'),2::bigint,'tagged identity reclassification and new test activity remain separately visible to Super Admin');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.remove_saved_member_profile('10000000-0000-4000-8000-000000000003')$$,'member removes a profile from her private shortlist');
select is(public.is_member_profile_saved('10000000-0000-4000-8000-000000000003'),false,'removed profile no longer appears saved');
select lives_ok($$select public.respond_to_community_invitation((select id from public.communities where slug='founding-table-nairobi'),true)$$,'invited attendee deliberately accepts founding-room access');
select is((select status from public.community_memberships where community_id=(select id from public.communities where slug='founding-table-nairobi')and user_id='10000000-0000-4000-8000-000000000002'),'active','accepted cohort invitation becomes active');
select lives_ok($$select public.save_community_introduction((select id from public.communities where slug='founding-table-nairobi'),'I lead a growing East African enterprise.','I am building a trusted regional partner network.','I can offer commercial strategy and warm introductions.','I am seeking values-aligned distribution partners.')$$,'accepted cohort member saves a structured introduction');
select is((select count(*)from public.list_community_introductions((select id from public.communities where slug='founding-table-nairobi'))),1::bigint,'cohort member sees introductions only after accepting room access');
select is((select introduction_complete from public.get_my_activation_journey()),true,'member activation journey records the completed cohort introduction');
select is((select count(*)from public.list_my_circles()),1::bigint,'assigned member enters only her published Circle');
select is((select count(*)from public.list_circle_members((select circle_id from public.list_my_circles()limit 1))),3::bigint,'Circle member sees the blocked-safe cohort roster through the authorized member projection');
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

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((select request_mode from public.get_my_connection_preferences()),'open','member connection availability defaults to open');
select lives_ok($$select public.set_my_connection_preferences('curated_only')$$,'member may limit new relationships to curated introductions');
select is((select request_mode from public.get_my_connection_preferences()),'curated_only','curated-only preference persists for the owning member');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select request_mode from public.list_connection_availability()where user_id='10000000-0000-4000-8000-000000000004'),'curated_only','member discovery receives a plain-language availability state');
select throws_ok($$select public.request_connection_with_context('10000000-0000-4000-8000-000000000004',null,'I would value learning about your regional event operations experience.')$$,'P0001','Member accepts curated introductions only','direct requests cannot bypass a curated-only preference');
select is((select count(*)from public.member_connection_preferences),0::bigint,'members cannot directly read another person connection preference row');
select throws_ok($$select public.create_curated_introduction('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','Both members can exchange practical regional growth experience.')$$,'P0001','Super admin required','member cannot curate introductions');
select throws_ok($$select *from public.list_curated_introductions_admin()$$,'P0001','Super admin required','member cannot read curated introduction operations');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select request_mode from public.list_connection_availability_admin()where user_id='10000000-0000-4000-8000-000000000004'),'curated_only','admin curation receives availability without opening private settings');
select lives_ok($$select public.create_curated_introduction('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','Both members can exchange practical regional growth experience.')$$,'super admin proposes a relevant introduction without opening contact access');
select is((select count(*)from public.list_curated_introductions_admin()),1::bigint,'super admin sees the consent state for the curated introduction');
select is((select count(*)from public.curated_introductions),0::bigint,'super admin cannot bypass the scoped operation to browse member introduction rows');
select throws_ok($$select public.create_curated_introduction('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','A duplicate introduction should never create duplicate invitations.')$$,'P0001','A curated introduction is already awaiting consent','only one pending curated introduction may exist for a member pair');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)from public.list_my_curated_introductions()),1::bigint,'first member sees only her own curated introduction');
select is((select reason from public.list_my_curated_introductions()limit 1),'Both members can exchange practical regional growth experience.','both members receive the same useful introduction context');
select is(public.respond_to_curated_introduction((select introduction_id from public.list_my_curated_introductions()limit 1),'accept'),'pending','first consent keeps the introduction private while awaiting the other member');
select is((select count(*)from public.connections where user_low=least('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000004'::uuid)and user_high=greatest('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000004'::uuid)and status='accepted'),0::bigint,'one-sided consent never opens a connection');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is(public.respond_to_curated_introduction((select introduction_id from public.list_my_curated_introductions()limit 1),'accept'),'accepted','second consent completes the curated introduction');
select is((select status from public.connections where user_low=least('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000004'::uuid)and user_high=greatest('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000004'::uuid)),'accepted','mutual consent opens exactly one accepted connection');
select is((select count(*)from public.notifications where title='Your introduction is ready'),1::bigint,'second member receives her own ready notification');
select lives_ok($$select public.set_my_connection_preferences('paused')$$,'member may pause every new introduction without affecting accepted connections');
select is((select request_mode from public.get_my_connection_preferences()),'paused','paused connection preference persists');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select status from public.list_curated_introductions_admin()limit 1),'accepted','admin sees completion state without seeing private messages');
select is((select request_mode from public.list_connection_availability_admin()where user_id='10000000-0000-4000-8000-000000000004'),'paused','admin selector receives the paused state and can exclude that member');
select throws_ok($$select public.create_curated_introduction('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','Both members could otherwise exchange regional operating experience.')$$,'P0001','One or both members are not accepting curated introductions','paused preference blocks even an Admin-curated proposal');
select throws_ok($$select public.create_curated_introduction('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','An existing accepted relationship must not be introduced again.')$$,'P0001','A connection journey already exists','accepted connections cannot receive duplicate curated introductions');
select is((select count(*)from public.audit_events where action='curated_introduction.created'),1::bigint,'curated introduction creation is auditable without copying its reason');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.save_connection_followup((select id from public.connections where user_low=least('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000003'::uuid)and user_high=greatest('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000003'::uuid)),'Values careful regional partnerships.','Send the supplier introduction discussed at the table.',current_date)$$,'member saves a private next step for an accepted relationship');
select is((select count(*)from public.list_my_connection_followups()),1::bigint,'member lists only her own relationship follow-up');
select is((select private_note from public.list_my_connection_followups()limit 1),'Values careful regional partnerships.','private relationship note remains available to its owner');
select is((select count(*)from public.list_due_connection_followups(3)),1::bigint,'due relationship follow-up surfaces through the focused home projection');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)from public.connection_followups),0::bigint,'the other connected member cannot read a private relationship note');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.save_connection_followup((select id from public.connections where user_low=least('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000003'::uuid)and user_high=greatest('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000003'::uuid)),'Unauthorized private note.','Attempt a follow-up outside my relationship.',current_date)$$,'P0001','Accepted connection required','non-participant cannot attach a follow-up to another relationship');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)from public.connection_followups),0::bigint,'super admin cannot browse private relationship notes');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.complete_connection_followup((select connection_id from public.list_my_connection_followups()limit 1))$$,'member deliberately completes her next step');
select is((select count(*)from public.list_due_connection_followups(3)),0::bigint,'completed follow-up no longer appears due');
select is((select private_note from public.list_my_connection_followups()limit 1),'Values careful regional partnerships.','completing a next step preserves the owners private relationship context');
select lives_ok($$select public.remove_connection_followup((select connection_id from public.list_my_connection_followups()limit 1))$$,'member may delete her private relationship plan completely');
select is((select count(*)from public.list_my_connection_followups()),0::bigint,'removed relationship plan leaves no private follow-up row');

select lives_ok($$select public.record_connection_outcome((select id from public.connections where user_low=least('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000004'::uuid)and user_high=greatest('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000004'::uuid)),'collaboration',current_date,'We agreed to test a joint supplier programme in Nairobi.',true)$$,'member privately records a real outcome from an accepted connection');
select is((select count(*)from public.list_my_connection_outcomes()),1::bigint,'member lists only her own recorded relationship outcome');
select is((select private_detail from public.list_my_connection_outcomes()limit 1),'We agreed to test a joint supplier programme in Nairobi.','private outcome detail remains available to its owner');
select is((select count(*)from public.audit_events where action='connection.outcome_recorded'and metadata::text like'%joint supplier programme%'),0::bigint,'outcome audit metadata never copies the private detail');
select lives_ok($$select public.record_connection_outcome((select id from public.connections where user_low=least('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000004'::uuid)and user_high=greatest('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000004'::uuid)),'mentorship',current_date,'A private mentoring relationship began after our introduction.',false)$$,'member may keep an outcome completely private from aggregate reporting');
select is((select count(*)from public.list_my_connection_outcomes()),2::bigint,'owner sees both anonymously shared and completely private outcomes');
select lives_ok($$select public.update_connection_outcome((select outcome_id from public.list_my_connection_outcomes()where outcome_type='mentorship'limit 1),'knowledge',current_date-1,'The corrected private record describes knowledge shared after our introduction.',false)$$,'owner may correct an outcome while keeping it completely private');
select is((select outcome_type from public.list_my_connection_outcomes()where outcome_type='knowledge'),'knowledge','corrected outcome category persists for the owner');
select is((select private_detail from public.list_my_connection_outcomes()where outcome_type='knowledge'),'The corrected private record describes knowledge shared after our introduction.','corrected private detail remains owner-only');
select is((select share_anonymously from public.list_my_connection_outcomes()where outcome_type='knowledge'),false,'owner may explicitly keep a corrected outcome out of anonymous totals');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)from public.connection_outcomes),0::bigint,'the other connected member cannot read the owners private outcomes');
select lives_ok($$select public.record_connection_outcome((select id from public.connections where user_low=least('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000003'::uuid)and user_high=greatest('10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000003'::uuid)),'referral',current_date,'A useful supplier referral followed our first conversation.',true)$$,'tagged test member may exercise the same private outcome workflow');
select is((select count(*)from public.list_my_connection_outcomes()),1::bigint,'test member still reads only her own outcome');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((select count(*)from public.connection_outcomes),0::bigint,'event staff cannot browse member relationship outcomes');
select throws_ok($$select *from public.get_connection_outcome_summary(365)$$,'P0001','Super admin required','non-admin members cannot access anonymous community aggregates');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)from public.connection_outcomes),0::bigint,'super admin cannot directly browse outcome identities or private notes');
select is((select count(*)from public.audit_events where action='connection.outcome_updated'),1::bigint,'outcome corrections are auditable');
select is((select count(*)from public.audit_events where action='connection.outcome_updated'and metadata::text like'%corrected private record%'),0::bigint,'outcome correction audit metadata never copies private detail');
select is((select count(*)from public.get_connection_outcome_summary(365)),0::bigint,'a category reported by fewer than three real members remains suppressed');
set local role postgres;
insert into public.connections(id,user_low,user_high,requester_id,recipient_id,status,responded_at)values
 ('95000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','accepted',now());
insert into public.connection_outcomes(id,owner_id,connection_id,outcome_type,occurred_on,private_detail,share_anonymously)values
 ('95000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004',(select id from public.connections where user_low='10000000-0000-4000-8000-000000000002'and user_high='10000000-0000-4000-8000-000000000004'),'collaboration',current_date,'Staff records a distinct real-member collaboration outcome.',true),
 ('95000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','collaboration',current_date,'Admin records a distinct real-member collaboration outcome.',true);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)from public.get_connection_outcome_summary(365)),1::bigint,'a category becomes reportable only after three different real members contribute');
select is((select outcome_type from public.get_connection_outcome_summary(365)limit 1),'collaboration','private and test-account outcomes remain excluded from the reportable category');
select is((select outcome_count from public.get_connection_outcome_summary(365)limit 1),3::bigint,'the thresholded aggregate includes only the three eligible real-member reports');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.update_connection_outcome('95000000-0000-4000-8000-000000000002','collaboration',current_date,'Attempt to alter another members private outcome.',false)$$,'P0001','Connection outcome not found','member cannot alter another owners outcome or sharing choice');
select lives_ok($$select public.remove_connection_outcome((select outcome_id from public.list_my_connection_outcomes()where outcome_type='knowledge'limit 1))$$,'member can delete her completely private outcome');
select is((select count(*)from public.list_my_connection_outcomes()),1::bigint,'deleting one outcome preserves the owners remaining relationship history');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)from public.audit_events where action='connection.outcome_removed'),1::bigint,'outcome deletion is auditable without exposing its content');

set local role postgres;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
select
  ('96000000-0000-4000-8000-'||lpad(sequence::text,12,'0'))::uuid,
  'request-boundary-'||sequence||'@test.invalid',
  'authenticated',
  'authenticated',
  '{}',
  '{}',
  now()
from generate_series(1,11)sequence;
update public.profiles
set access_status='active',visibility_paused=false,display_name='Request boundary member'
where id::text like '96000000-0000-4000-8000-%';
update public.connections
set status='ignored',responded_at=now(),updated_at=now()
where user_low='10000000-0000-4000-8000-000000000002'
  and user_high='10000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.request_connection_with_context('10000000-0000-4000-8000-000000000003',null,'A retry inside the quiet period must remain unavailable.')$$,'P0001','Please wait before requesting this connection again','ignored requests receive a quiet retry cooldown without revealing the response');
select throws_ok($$select public.request_connection('10000000-0000-4000-8000-000000000003',null)$$,'P0001','Please wait before requesting this connection again','legacy request RPC cannot bypass the quiet retry cooldown');
set local role postgres;
update public.connections
set updated_at=now()-interval'31 days'
where user_low='10000000-0000-4000-8000-000000000002'
  and user_high='10000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.request_connection_with_context('10000000-0000-4000-8000-000000000003',null,'A respectful retry is available after the quiet period ends.')$$,'member may retry an introduction after the quiet cooldown expires');
set local role postgres;
insert into public.connections(user_low,user_high,requester_id,recipient_id,status)
select
  '10000000-0000-4000-8000-000000000002',
  ('96000000-0000-4000-8000-'||lpad(sequence::text,12,'0'))::uuid,
  '10000000-0000-4000-8000-000000000002',
  ('96000000-0000-4000-8000-'||lpad(sequence::text,12,'0'))::uuid,
  'pending'
from generate_series(1,9)sequence;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.request_connection_with_context('96000000-0000-4000-8000-000000000010',null,'An excessive outstanding request must not reach another member.')$$,'P0001','Outstanding connection request limit reached','member cannot accumulate more than ten unanswered requests');
set local role postgres;
update public.connections
set status='accepted',responded_at=now(),updated_at=now()
where requester_id='10000000-0000-4000-8000-000000000002'
  and status='pending';
insert into public.audit_events(actor_id,action,target_type)
select
  '10000000-0000-4000-8000-000000000002',
  'connection.requested',
  'connection'
from generate_series(
  1,
  20-(select count(*)::integer from public.audit_events where actor_id='10000000-0000-4000-8000-000000000002'and action='connection.requested'and created_at>now()-interval'24 hours')
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.request_connection_with_context('96000000-0000-4000-8000-000000000011',null,'A request beyond the daily safety limit must be rejected.')$$,'P0001','Daily connection request limit reached','member cannot exceed twenty successful requests in a rolling day');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)from public.audit_events where actor_id='10000000-0000-4000-8000-000000000002'and action='connection.requested'and created_at>now()-interval'24 hours'),20::bigint,'blocked attempts do not create misleading successful-request audit events');

set local role postgres;
update public.user_roles
set expires_at=now()-interval'1 minute'
where user_id='10000000-0000-4000-8000-000000000004'
  and role='event_staff';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is(public.is_admin(array['event_staff']::public.app_role[]),false,'expired staff roles stop authorizing at the database boundary');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.grant_time_bounded_admin_access('member-b@test.invalid','moderator',now()+interval'60 days','Temporary production boundary review access')$$,'Super Admin can grant audited time-bounded team access');
select is((select expires_at>now()from public.user_roles where user_id='10000000-0000-4000-8000-000000000003'and role='moderator'),true,'time-bounded team access records a future hard expiry');
select lives_ok($$select public.revoke_admin_access('10000000-0000-4000-8000-000000000003','moderator','Temporary review access is complete')$$,'Super Admin can immediately revoke delegated team access');

select *from finish();
rollback;
