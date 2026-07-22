begin;

insert into public.feature_flags(key,enabled,description)values('learning',false,'Courses, lessons and member progress')on conflict(key)do nothing;

create table public.courses(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$'),title text not null check(char_length(title)between 5 and 120),
 summary text not null check(char_length(summary)between 20 and 300),description text not null check(char_length(description)between 30 and 5000),instructor_name text not null check(char_length(instructor_name)between 2 and 120),
 cover_image_path text,access_type text not null default'free'check(access_type in('free','purchase','event_bundle','manual')),
 bundled_event_id uuid references public.events(id)on delete set null,price_minor bigint not null default 0 check(price_minor>=0),currency text not null default'KES'check(currency~'^[A-Z]{3}$'),
 payment_mode text not null default'closed'check(payment_mode in('automatic','manual_review','closed')),status text not null default'draft'check(status in('draft','published','archived')),
 created_by uuid not null references auth.users(id)on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint course_access_configuration check((access_type='purchase'and price_minor>0)or(access_type<>'purchase'and price_minor=0)),
 constraint course_payment_configuration check(access_type='purchase'or payment_mode='closed'),
 constraint course_event_bundle_configuration check((access_type='event_bundle'and bundled_event_id is not null)or(access_type<>'event_bundle'and bundled_event_id is null))
);
create table public.course_lessons(
 id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id)on delete cascade,title text not null check(char_length(title)between 3 and 160),summary text,
 lesson_type text not null default'text'check(lesson_type in('text','video','file','live')),content text,asset_path text,external_url text,duration_minutes integer check(duration_minutes is null or duration_minutes between 1 and 1440),
 status text not null default'draft'check(status in('draft','published','archived')),sort_order integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint lesson_delivery_present check(lesson_type='live'or nullif(trim(coalesce(content,'')),'')is not null or nullif(trim(coalesce(asset_path,'')),'')is not null or nullif(trim(coalesce(external_url,'')),'')is not null)
);
create table public.course_enrollments(
 id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id)on delete cascade,user_id uuid not null references auth.users(id)on delete cascade,
 order_id uuid references public.orders(id)on delete restrict,source text not null check(source in('free','purchase','event_bundle','manual_grant')),
 status text not null default'active'check(status in('active','completed','revoked')),enrolled_at timestamptz not null default now(),completed_at timestamptz,updated_at timestamptz not null default now(),unique(course_id,user_id)
);
create table public.lesson_progress(
 lesson_id uuid not null references public.course_lessons(id)on delete cascade,user_id uuid not null references auth.users(id)on delete cascade,
 status text not null default'started'check(status in('started','completed')),progress_percent smallint not null default 0 check(progress_percent between 0 and 100),last_position_seconds integer check(last_position_seconds is null or last_position_seconds>=0),
 started_at timestamptz not null default now(),completed_at timestamptz,updated_at timestamptz not null default now(),primary key(lesson_id,user_id)
);

alter table public.orders add column order_type text not null default'event'check(order_type in('event','course'));
alter table public.orders alter column event_id drop not null;
alter table public.order_items add column course_id uuid references public.courses(id)on delete restrict;
alter table public.order_items alter column ticket_type_id drop not null;
alter table public.order_items add constraint order_item_exactly_one_product check(num_nonnulls(ticket_type_id,course_id)=1);
alter table public.orders add constraint order_context_present check((order_type='event'and event_id is not null)or(order_type='course'and event_id is null));
alter table public.entitlements add column course_id uuid references public.courses(id)on delete cascade;
alter table public.entitlements drop constraint if exists entitlements_entitlement_type_check;
alter table public.entitlements add constraint entitlements_entitlement_type_check check(entitlement_type in('event_access','member_onboarding','course_access'));
create unique index entitlements_user_course_type_idx on public.entitlements(user_id,course_id,entitlement_type)where course_id is not null;
create index courses_catalog_idx on public.courses(status,access_type,created_at desc);
create index course_lessons_order_idx on public.course_lessons(course_id,status,sort_order);
create index course_enrollments_user_idx on public.course_enrollments(user_id,status,enrolled_at desc);
create index lesson_progress_user_idx on public.lesson_progress(user_id,updated_at desc);
create index orders_type_status_idx on public.orders(order_type,status,created_at desc);

alter table public.courses enable row level security;alter table public.course_lessons enable row level security;alter table public.course_enrollments enable row level security;alter table public.lesson_progress enable row level security;
create policy "Members read published learning catalog"on public.courses for select to authenticated using((select enabled from public.feature_flags where key='learning')and public.is_active_member(auth.uid())and status='published'or public.is_admin(array['super_admin']::public.app_role[]));
create policy "Enrolled members read published lessons"on public.course_lessons for select to authenticated using((status='published'and exists(select 1 from public.course_enrollments e where e.course_id=course_lessons.course_id and e.user_id=auth.uid()and e.status in('active','completed')))or public.is_admin(array['super_admin']::public.app_role[]));
create policy "Members read own course enrollments"on public.course_enrollments for select to authenticated using(user_id=auth.uid()or public.is_admin(array['super_admin']::public.app_role[]));
create policy "Members read own lesson progress"on public.lesson_progress for select to authenticated using(user_id=auth.uid()or public.is_admin(array['super_admin']::public.app_role[]));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('course-assets','course-assets',false,52428800,array['application/pdf','video/mp4','video/webm','image/jpeg','image/png','image/webp'])on conflict(id)do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Super admins manage course assets"on storage.objects for all to authenticated using(bucket_id='course-assets'and public.is_admin(array['super_admin']::public.app_role[]))with check(bucket_id='course-assets'and public.is_admin(array['super_admin']::public.app_role[]));
create policy "Enrolled members read course assets"on storage.objects for select to authenticated using(bucket_id='course-assets'and exists(select 1 from public.course_enrollments e where e.course_id=(storage.foldername(name))[1]::uuid and e.user_id=auth.uid()and e.status in('active','completed')));

create or replace function public.learning_enabled()returns boolean language sql stable security definer set search_path=''as $$select coalesce((select enabled from public.feature_flags where key='learning'),false)$$;

create or replace function public.save_course(p_course_id uuid,p_slug text,p_title text,p_summary text,p_description text,p_instructor text,p_access_type text,p_event_id uuid,p_price_minor bigint,p_currency text,p_payment_mode text,p_status text)
returns uuid language plpgsql security definer set search_path=''as $$declare saved uuid:=p_course_id;actor uuid:=auth.uid();begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 if p_access_type not in('free','purchase','event_bundle','manual')or p_payment_mode not in('automatic','manual_review','closed')or p_status not in('draft','published','archived')then raise exception'Unsupported course configuration';end if;
 if p_access_type='purchase'and coalesce(p_price_minor,0)<=0 then raise exception'Purchased courses require a positive price';end if;
 if p_access_type<>'purchase'and coalesce(p_price_minor,0)<>0 then raise exception'Only purchased courses may have a price';end if;
 if p_access_type<>'purchase'and p_payment_mode<>'closed'then raise exception'Payment mode applies only to purchased courses';end if;
 if p_access_type='event_bundle'and p_event_id is null then raise exception'Bundled event required';end if;
 if p_course_id is null then insert into public.courses(slug,title,summary,description,instructor_name,access_type,bundled_event_id,price_minor,currency,payment_mode,status,created_by)values(lower(trim(p_slug)),trim(p_title),trim(p_summary),trim(p_description),trim(p_instructor),p_access_type,case when p_access_type='event_bundle'then p_event_id end,coalesce(p_price_minor,0),upper(p_currency),p_payment_mode,p_status,actor)returning id into saved;
 else update public.courses set slug=lower(trim(p_slug)),title=trim(p_title),summary=trim(p_summary),description=trim(p_description),instructor_name=trim(p_instructor),access_type=p_access_type,bundled_event_id=case when p_access_type='event_bundle'then p_event_id end,price_minor=coalesce(p_price_minor,0),currency=upper(p_currency),payment_mode=p_payment_mode,status=p_status,updated_at=now()where id=p_course_id;if not found then raise exception'Course not found';end if;end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,case when p_course_id is null then'learning.course_created'else'learning.course_updated'end,'course',saved,jsonb_build_object('status',p_status,'access_type',p_access_type));return saved;
end;$$;

create or replace function public.save_course_lesson(p_lesson_id uuid,p_course_id uuid,p_title text,p_summary text,p_lesson_type text,p_content text,p_asset_path text,p_external_url text,p_duration integer,p_status text,p_sort_order integer)
returns uuid language plpgsql security definer set search_path=''as $$declare saved uuid:=p_lesson_id;begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 if p_lesson_type not in('text','video','file','live')or p_status not in('draft','published','archived')then raise exception'Unsupported lesson configuration';end if;
 if p_lesson_id is null then insert into public.course_lessons(course_id,title,summary,lesson_type,content,asset_path,external_url,duration_minutes,status,sort_order)values(p_course_id,trim(p_title),nullif(trim(p_summary),''),p_lesson_type,nullif(trim(p_content),''),nullif(trim(p_asset_path),''),nullif(trim(p_external_url),''),p_duration,p_status,greatest(coalesce(p_sort_order,0),0))returning id into saved;
 else update public.course_lessons set title=trim(p_title),summary=nullif(trim(p_summary),''),lesson_type=p_lesson_type,content=nullif(trim(p_content),''),asset_path=nullif(trim(p_asset_path),''),external_url=nullif(trim(p_external_url),''),duration_minutes=p_duration,status=p_status,sort_order=greatest(coalesce(p_sort_order,0),0),updated_at=now()where id=p_lesson_id and course_id=p_course_id;if not found then raise exception'Lesson not found';end if;end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),case when p_lesson_id is null then'learning.lesson_created'else'learning.lesson_updated'end,'course_lesson',saved,jsonb_build_object('course_id',p_course_id,'status',p_status));return saved;
end;$$;

create or replace function public.list_courses()
returns table(course_id uuid,slug text,title text,summary text,description text,instructor_name text,access_type text,price_minor bigint,currency text,payment_mode text,status text,lesson_count bigint,enrollment_status text,progress_percent numeric)
language plpgsql stable security definer set search_path=''as $$begin
 if not public.is_active_member(auth.uid())then raise exception'Active membership required';end if;if not public.learning_enabled()and not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Learning is not available yet';end if;
 return query select c.id,c.slug,c.title,c.summary,c.description,c.instructor_name,c.access_type,c.price_minor,c.currency,c.payment_mode,c.status,(select count(*)from public.course_lessons l where l.course_id=c.id and(l.status='published'or public.is_admin(array['super_admin']::public.app_role[]))),e.status,coalesce((select round(avg(lp.progress_percent),1)from public.lesson_progress lp join public.course_lessons cl on cl.id=lp.lesson_id where cl.course_id=c.id and lp.user_id=auth.uid()),0)from public.courses c left join public.course_enrollments e on e.course_id=c.id and e.user_id=auth.uid()where c.status='published'or public.is_admin(array['super_admin']::public.app_role[])order by c.created_at desc;
end;$$;

create or replace function public.enroll_in_course(p_course_id uuid)
returns uuid language plpgsql security definer set search_path=''as $$declare actor uuid:=auth.uid();target public.courses%rowtype;saved uuid;source_value text;begin
 if not public.learning_enabled()or not public.is_active_member(actor)then raise exception'Learning is unavailable';end if;select*into target from public.courses where id=p_course_id and status='published';if not found then raise exception'Course not found';end if;
 if target.access_type='free'then source_value:='free';elsif target.access_type='event_bundle'and exists(select 1 from public.event_memberships where event_id=target.bundled_event_id and user_id=actor and status in('confirmed','attended'))then source_value:='event_bundle';else raise exception'Purchase or manual access required';end if;
 insert into public.course_enrollments(course_id,user_id,source,status)values(p_course_id,actor,source_value,'active')on conflict(course_id,user_id)do update set status='active',source=excluded.source,updated_at=now()where course_enrollments.status='revoked'returning id into saved;if saved is null then raise exception'Already enrolled';end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'learning.enrolled','course_enrollment',saved,jsonb_build_object('course_id',p_course_id,'source',source_value));return saved;
end;$$;

create or replace function public.create_course_order(p_course_id uuid,p_manual_reference text default null,p_manual_note text default null)
returns uuid language plpgsql security definer set search_path=''as $$declare actor uuid:=auth.uid();target public.courses%rowtype;saved uuid;order_status text;begin
 if not public.learning_enabled()or not public.is_active_member(actor)then raise exception'Learning is unavailable';end if;select*into target from public.courses where id=p_course_id and status='published'and access_type='purchase'for share;if not found or target.payment_mode='closed'then raise exception'Course checkout is closed';end if;
 if exists(select 1 from public.course_enrollments where course_id=p_course_id and user_id=actor and status in('active','completed'))then raise exception'Already enrolled';end if;
 if exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where o.user_id=actor and i.course_id=p_course_id and o.status not in('cancelled','expired','refunded'))then raise exception'An active course order already exists';end if;
 order_status:=case when target.payment_mode='automatic'then'pending_payment'else'pending_review'end;
 insert into public.orders(user_id,event_id,status,processing_mode,currency,subtotal_minor,total_minor,reservation_expires_at,order_type)values(actor,null,order_status,target.payment_mode,target.currency,target.price_minor,target.price_minor,case when target.payment_mode='automatic'then now()+interval'20 minutes'end,'course')returning id into saved;
 insert into public.order_items(order_id,ticket_type_id,course_id,quantity,unit_price_minor,line_total_minor)values(saved,null,p_course_id,1,target.price_minor,target.price_minor);
 if target.payment_mode='manual_review'then insert into public.manual_payment_reviews(order_id,status,submitted_reference,submitter_note)values(saved,'pending',nullif(trim(p_manual_reference),''),nullif(trim(p_manual_note),''));end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'learning.order_created','order',saved,jsonb_build_object('course_id',p_course_id,'mode',target.payment_mode));return saved;
end;$$;

create or replace function public.fulfill_course_order(p_order_id uuid,p_source text)
returns void language plpgsql security definer set search_path=''as $$declare target public.orders%rowtype;target_course uuid;enrollment uuid;begin
 select*into target from public.orders where id=p_order_id and order_type='course'for update;if not found then raise exception'Course order not found';end if;if target.status='fulfilled'then return;end if;if target.status not in('paid','approved')then raise exception'Order is not approved for fulfillment';end if;
 select course_id into target_course from public.order_items where order_id=p_order_id;if target_course is null then raise exception'Course item not found';end if;
 insert into public.course_enrollments(course_id,user_id,order_id,source,status)values(target_course,target.user_id,target.id,'purchase','active')on conflict(course_id,user_id)do update set order_id=excluded.order_id,source='purchase',status='active',updated_at=now()returning id into enrollment;
 insert into public.entitlements(user_id,event_id,course_id,order_id,entitlement_type,metadata)values(target.user_id,null,target_course,target.id,'course_access',jsonb_build_object('source',p_source))on conflict(user_id,course_id,entitlement_type)where course_id is not null do nothing;
 update public.orders set status='fulfilled',fulfilled_at=now(),updated_at=now()where id=p_order_id;perform public.enqueue_notification(target.user_id,'system','Course access ready','Your course is ready to begin.','/learning','course-access:'||target_course);
end;$$;

create or replace function public.review_course_order(p_order_id uuid,p_action text,p_note text)
returns void language plpgsql security definer set search_path=''as $$begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;if p_action not in('approve','reject')then raise exception'Unsupported action';end if;
 update public.manual_payment_reviews set status=case when p_action='approve'then'approved'else'rejected'end,reviewer_id=auth.uid(),reviewer_note=nullif(trim(p_note),''),reviewed_at=now(),updated_at=now()where order_id=p_order_id and status='pending';if not found then raise exception'Pending review not found';end if;
 update public.orders set status=case when p_action='approve'then'approved'else'cancelled'end,updated_at=now()where id=p_order_id and order_type='course';if not found then raise exception'Course order not found';end if;if p_action='approve'then perform public.fulfill_course_order(p_order_id,'manual_review');end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'learning.manual_'||p_action,'order',p_order_id,jsonb_build_object('note',nullif(trim(p_note),'')));
end;$$;

create or replace function public.list_course_orders()
returns table(order_id uuid,reference text,course_id uuid,course_title text,user_id uuid,email text,display_name text,status text,processing_mode text,total_minor bigint,currency text,submitted_reference text,submitter_note text,created_at timestamptz)
language plpgsql stable security definer set search_path=''as $$begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;
 return query select o.id,o.reference,i.course_id,c.title,o.user_id,u.email::text,p.display_name,o.status,o.processing_mode,o.total_minor,o.currency,m.submitted_reference,m.submitter_note,o.created_at from public.orders o join public.order_items i on i.order_id=o.id join public.courses c on c.id=i.course_id join auth.users u on u.id=o.user_id left join public.profiles p on p.id=o.user_id left join public.manual_payment_reviews m on m.order_id=o.id where o.order_type='course'order by o.created_at desc;
end;$$;

create or replace function public.grant_course_access(p_course_id uuid,p_user_email text,p_note text)
returns uuid language plpgsql security definer set search_path=''as $$declare target_user uuid;saved uuid;begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;if char_length(trim(coalesce(p_note,'')))<5 then raise exception'Grant reason required';end if;select u.id into target_user from auth.users u join public.profiles p on p.id=u.id where lower(u.email)=lower(trim(p_user_email))and p.access_status='active';if target_user is null then raise exception'Active member not found';end if;
 insert into public.course_enrollments(course_id,user_id,source,status)values(p_course_id,target_user,'manual_grant','active')on conflict(course_id,user_id)do update set source='manual_grant',status='active',updated_at=now()returning id into saved;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'learning.access_granted','course_enrollment',saved,jsonb_build_object('course_id',p_course_id,'member_id',target_user,'note',trim(p_note)));return saved;
end;$$;

create or replace function public.save_lesson_progress(p_lesson_id uuid,p_progress integer,p_position integer default null)
returns void language plpgsql security definer set search_path=''as $$declare course uuid;total integer;done integer;begin
 select course_id into course from public.course_lessons where id=p_lesson_id and status='published';if course is null or not exists(select 1 from public.course_enrollments where course_id=course and user_id=auth.uid()and status in('active','completed'))then raise exception'Lesson access required';end if;
 insert into public.lesson_progress(lesson_id,user_id,status,progress_percent,last_position_seconds,completed_at)values(p_lesson_id,auth.uid(),case when p_progress>=100 then'completed'else'started'end,least(greatest(p_progress,0),100),p_position,case when p_progress>=100 then now()end)on conflict(lesson_id,user_id)do update set status=case when lesson_progress.status='completed'or excluded.status='completed'then'completed'else'started'end,progress_percent=greatest(lesson_progress.progress_percent,excluded.progress_percent),last_position_seconds=excluded.last_position_seconds,completed_at=coalesce(lesson_progress.completed_at,excluded.completed_at),updated_at=now();
 select count(*),count(*)filter(where coalesce(lp.progress_percent,0)=100)into total,done from public.course_lessons l left join public.lesson_progress lp on lp.lesson_id=l.id and lp.user_id=auth.uid()where l.course_id=course and l.status='published';if total>0 and done=total then update public.course_enrollments set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()where course_id=course and user_id=auth.uid();end if;
end;$$;

create or replace function public.process_paystack_payment(p_provider_event_id text,p_event_type text,p_reference text,p_status text,p_amount_minor bigint,p_currency text,p_payload jsonb,p_signature_verified boolean)
returns text language plpgsql security definer set search_path=''as $$declare target public.orders%rowtype;existing_processed timestamptz;begin
 if auth.role()<>'service_role'then raise exception'Service role required';end if;if not p_signature_verified then raise exception'Provider signature or server verification required';end if;
 insert into public.payment_events(provider,provider_event_id,event_type,signature_verified,payload)values('paystack',p_provider_event_id,p_event_type,true,coalesce(p_payload,'{}'::jsonb))on conflict(provider,provider_event_id)do nothing;
 select processed_at into existing_processed from public.payment_events where provider='paystack'and provider_event_id=p_provider_event_id for update;if existing_processed is not null then return'already_processed';end if;
 select*into target from public.orders where reference=p_reference for update;if not found then update public.payment_events set error_message='Order reference not found',processed_at=now()where provider='paystack'and provider_event_id=p_provider_event_id;return'order_not_found';end if;
 if target.total_minor<>p_amount_minor or target.currency<>upper(p_currency)then update public.payment_events set error_message='Amount or currency mismatch',processed_at=now()where provider='paystack'and provider_event_id=p_provider_event_id;insert into public.audit_events(action,target_type,target_id,metadata)values('payment.verification_mismatch','order',target.id,jsonb_build_object('expected_amount',target.total_minor,'received_amount',p_amount_minor));return'amount_mismatch';end if;
 insert into public.payment_attempts(order_id,provider,provider_reference,amount_minor,currency,status,provider_response)values(target.id,'paystack',p_reference,p_amount_minor,upper(p_currency),case when p_status='success'then'success'when p_status in('failed','abandoned','reversed')then p_status else'pending'end,coalesce(p_payload,'{}'::jsonb))on conflict(provider_reference)do update set status=excluded.status,provider_response=excluded.provider_response,updated_at=now();
 if p_status='success'then update public.orders set status='paid',updated_at=now()where id=target.id and status in('pending_payment','paid');if target.status<>'fulfilled'then if target.order_type='course'then perform public.fulfill_course_order(target.id,'paystack_verified');else perform public.fulfill_registration_order(target.id,'paystack_verified');end if;end if;
 elsif p_status in('failed','abandoned')then update public.orders set status='expired',updated_at=now()where id=target.id and status='pending_payment';if target.order_type='event'then update public.registration_requests set status='cancelled',updated_at=now()where order_id=target.id and status='pending_payment';end if;
 elsif p_status='reversed'then update public.orders set status='refunded',updated_at=now()where id=target.id;update public.entitlements set status='revoked',revoked_at=now()where order_id=target.id and status='active';if target.order_type='event'then update public.event_memberships set status='cancelled',updated_at=now()where order_id=target.id;else update public.course_enrollments set status='revoked',updated_at=now()where order_id=target.id;end if;end if;
 update public.payment_events set processed_at=now(),error_message=null where provider='paystack'and provider_event_id=p_provider_event_id;insert into public.audit_events(action,target_type,target_id,metadata)values('payment.paystack_'||p_status,'order',target.id,jsonb_build_object('order_type',target.order_type,'provider_event_id',p_provider_event_id));return case when p_status='success'then'fulfilled'else p_status end;
exception when others then update public.payment_events set error_message=sqlerrm where provider='paystack'and provider_event_id=p_provider_event_id;raise;end;$$;

revoke all on function public.learning_enabled()from public;grant execute on function public.learning_enabled()to authenticated;
revoke all on function public.save_course(uuid,text,text,text,text,text,text,uuid,bigint,text,text,text)from public;grant execute on function public.save_course(uuid,text,text,text,text,text,text,uuid,bigint,text,text,text)to authenticated;
revoke all on function public.save_course_lesson(uuid,uuid,text,text,text,text,text,text,integer,text,integer)from public;grant execute on function public.save_course_lesson(uuid,uuid,text,text,text,text,text,text,integer,text,integer)to authenticated;
revoke all on function public.list_courses()from public;grant execute on function public.list_courses()to authenticated;
revoke all on function public.enroll_in_course(uuid)from public;grant execute on function public.enroll_in_course(uuid)to authenticated;
revoke all on function public.create_course_order(uuid,text,text)from public;grant execute on function public.create_course_order(uuid,text,text)to authenticated;
revoke all on function public.fulfill_course_order(uuid,text)from public;
revoke all on function public.review_course_order(uuid,text,text)from public;grant execute on function public.review_course_order(uuid,text,text)to authenticated;
revoke all on function public.list_course_orders()from public;grant execute on function public.list_course_orders()to authenticated;
revoke all on function public.grant_course_access(uuid,text,text)from public;grant execute on function public.grant_course_access(uuid,text,text)to authenticated;
revoke all on function public.save_lesson_progress(uuid,integer,integer)from public;grant execute on function public.save_lesson_progress(uuid,integer,integer)to authenticated;
revoke all on function public.process_paystack_payment(text,text,text,text,bigint,text,jsonb,boolean)from public;grant execute on function public.process_paystack_payment(text,text,text,text,bigint,text,jsonb,boolean)to service_role;

comment on table public.courses is'Feature-gated learning catalog using the shared order, payment and entitlement engine.';
comment on table public.lesson_progress is'User-scoped monotonic lesson progress; completion cannot be reduced by a later client write.';
commit;
