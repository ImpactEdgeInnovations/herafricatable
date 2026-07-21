create table public.ticket_types (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  name text not null, description text, price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'KES' check (currency ~ '^[A-Z]{3}$'), inventory_quantity integer check (inventory_quantity is null or inventory_quantity > 0),
  sales_start_at timestamptz, sales_end_at timestamptz, status text not null default 'draft' check (status in ('draft','on_sale','paused','sold_out','archived')),
  sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint ticket_sales_time check (sales_end_at is null or sales_start_at is null or sales_end_at > sales_start_at), unique(event_id, name)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), reference text not null unique default ('HAT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  user_id uuid not null references auth.users(id) on delete restrict, event_id uuid not null references public.events(id) on delete restrict,
  status text not null check (status in ('pending_payment','pending_review','paid','approved','fulfilled','cancelled','expired','refunded')),
  processing_mode text not null check (processing_mode in ('automatic','manual_review')), currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null check (subtotal_minor >= 0), total_minor bigint not null check (total_minor >= 0),
  reservation_expires_at timestamptz, fulfilled_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict, quantity integer not null check (quantity between 1 and 10),
  unit_price_minor bigint not null check (unit_price_minor >= 0), line_total_minor bigint not null check (line_total_minor >= 0), unique(order_id,ticket_type_id)
);
create table public.registration_requests (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, order_id uuid unique references public.orders(id) on delete set null,
  status text not null check (status in ('waitlisted','pending_payment','pending_review','approved','rejected','cancelled')),
  attendee_note text check (char_length(attendee_note) <= 1000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(event_id,user_id)
);
create table public.manual_payment_reviews (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id) on delete cascade,
  submitted_reference text, submitter_note text check (char_length(submitter_note) <= 1000), status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id uuid references auth.users(id) on delete set null, reviewer_note text, reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null, provider_reference text not null unique, amount_minor bigint not null, currency text not null,
  status text not null check (status in ('initialized','pending','success','failed','abandoned','reversed')),
  authorization_url text, provider_response jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.payment_events (
  id uuid primary key default gen_random_uuid(), provider text not null, provider_event_id text not null,
  event_type text not null, signature_verified boolean not null default false, payload jsonb not null,
  processed_at timestamptz, error_message text, created_at timestamptz not null default now(), unique(provider,provider_event_id)
);
create table public.event_memberships (
  event_id uuid not null references public.events(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid unique references public.orders(id) on delete restrict, ticket_type_id uuid references public.ticket_types(id) on delete restrict,
  status text not null default 'confirmed' check (status in ('registered','confirmed','attended','cancelled')),
  confirmed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(event_id,user_id)
);
create table public.entitlements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade, order_id uuid not null references public.orders(id) on delete restrict,
  entitlement_type text not null check (entitlement_type in ('event_access','member_onboarding')),
  status text not null default 'active' check (status in ('active','revoked','expired')), granted_at timestamptz not null default now(),
  revoked_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  unique(order_id,entitlement_type), unique(user_id,event_id,entitlement_type)
);
create index ticket_types_event_sale_idx on public.ticket_types(event_id,status,sales_start_at,sales_end_at);
create index orders_user_created_idx on public.orders(user_id,created_at desc);
create index orders_event_status_idx on public.orders(event_id,status,created_at desc);
create index registrations_event_status_idx on public.registration_requests(event_id,status,created_at desc);
create index payment_attempts_order_idx on public.payment_attempts(order_id,created_at desc);

alter table public.ticket_types enable row level security; alter table public.orders enable row level security;
alter table public.order_items enable row level security; alter table public.registration_requests enable row level security;
alter table public.manual_payment_reviews enable row level security; alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security; alter table public.event_memberships enable row level security; alter table public.entitlements enable row level security;

create policy "Anyone reads on-sale tickets" on public.ticket_types for select to anon,authenticated using (status='on_sale' and exists(select 1 from public.events where events.id=ticket_types.event_id and events.status='published'));
create policy "Event admins manage tickets" on public.ticket_types for all to authenticated using(public.can_manage_event(event_id)) with check(public.can_manage_event(event_id));
create policy "Members read own orders" on public.orders for select to authenticated using(user_id=auth.uid());
create policy "Event admins read event orders" on public.orders for select to authenticated using(public.can_manage_event(event_id));
create policy "Members read own order items" on public.order_items for select to authenticated using(exists(select 1 from public.orders where orders.id=order_items.order_id and orders.user_id=auth.uid()));
create policy "Event admins read event order items" on public.order_items for select to authenticated using(exists(select 1 from public.orders where orders.id=order_items.order_id and public.can_manage_event(orders.event_id)));
create policy "Members read own registrations" on public.registration_requests for select to authenticated using(user_id=auth.uid());
create policy "Event admins read registrations" on public.registration_requests for select to authenticated using(public.can_manage_event(event_id));
create policy "Members read own manual review" on public.manual_payment_reviews for select to authenticated using(exists(select 1 from public.orders where orders.id=manual_payment_reviews.order_id and orders.user_id=auth.uid()));
create policy "Event admins read manual reviews" on public.manual_payment_reviews for select to authenticated using(exists(select 1 from public.orders where orders.id=manual_payment_reviews.order_id and public.can_manage_event(orders.event_id)));
create policy "Members read own payment attempts" on public.payment_attempts for select to authenticated using(exists(select 1 from public.orders where orders.id=payment_attempts.order_id and orders.user_id=auth.uid()));
create policy "Event admins read payment attempts" on public.payment_attempts for select to authenticated using(exists(select 1 from public.orders where orders.id=payment_attempts.order_id and public.can_manage_event(orders.event_id)));
create policy "Super admins read payment events" on public.payment_events for select to authenticated using(public.is_admin(array['super_admin']::public.app_role[]));
create policy "Members read own event memberships" on public.event_memberships for select to authenticated using(user_id=auth.uid());
create policy "Event admins read memberships" on public.event_memberships for select to authenticated using(public.can_manage_event(event_id));
create policy "Members read own entitlements" on public.entitlements for select to authenticated using(user_id=auth.uid());
create policy "Super admins read entitlements" on public.entitlements for select to authenticated using(public.is_admin(array['super_admin']::public.app_role[]));

create or replace function public.fulfill_registration_order(p_order_id uuid, p_source text)
returns void language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype; ticket_id uuid;
begin
  select * into target from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if target.status='fulfilled' then return; end if;
  if target.status not in ('paid','approved') then raise exception 'Order is not approved for fulfillment'; end if;
  select ticket_type_id into ticket_id from public.order_items where order_id=p_order_id order by id limit 1;
  insert into public.event_memberships(event_id,user_id,order_id,ticket_type_id,status,confirmed_at)
  values(target.event_id,target.user_id,target.id,ticket_id,'confirmed',now()) on conflict(event_id,user_id) do update set status='confirmed',confirmed_at=now(),updated_at=now();
  insert into public.entitlements(user_id,event_id,order_id,entitlement_type,metadata)
  values(target.user_id,target.event_id,target.id,'event_access',jsonb_build_object('source',p_source)) on conflict(user_id,event_id,entitlement_type) do nothing;
  insert into public.entitlements(user_id,event_id,order_id,entitlement_type,metadata)
  values(target.user_id,target.event_id,target.id,'member_onboarding',jsonb_build_object('source',p_source)) on conflict(user_id,event_id,entitlement_type) do nothing;
  update public.registration_requests set status='approved',updated_at=now() where order_id=p_order_id;
  update public.profiles set access_status='onboarding',updated_at=now() where id=target.user_id and access_status='pending';
  update public.orders set status='fulfilled',fulfilled_at=now(),updated_at=now() where id=p_order_id;
end; $$;

create or replace function public.save_ticket_type(p_ticket_id uuid,p_event_id uuid,p_name text,p_description text,p_price_minor bigint,p_currency text,p_inventory integer,p_sales_start timestamptz,p_sales_end timestamptz,p_status text,p_sort_order integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved uuid:=p_ticket_id;
begin
  if actor is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorized'; end if;
  if nullif(trim(p_name),'') is null or p_price_minor<0 or upper(p_currency)!~'^[A-Z]{3}$' then raise exception 'Valid name, price, and currency are required'; end if;
  if p_status not in ('draft','on_sale','paused','sold_out','archived') then raise exception 'Unsupported ticket status'; end if;
  if p_sales_end is not null and p_sales_start is not null and p_sales_end<=p_sales_start then raise exception 'Sales end must follow sales start'; end if;
  if p_ticket_id is null then insert into public.ticket_types(event_id,name,description,price_minor,currency,inventory_quantity,sales_start_at,sales_end_at,status,sort_order)
    values(p_event_id,trim(p_name),nullif(trim(p_description),''),p_price_minor,upper(p_currency),p_inventory,p_sales_start,p_sales_end,p_status,greatest(coalesce(p_sort_order,0),0)) returning id into saved;
  else update public.ticket_types set name=trim(p_name),description=nullif(trim(p_description),''),price_minor=p_price_minor,currency=upper(p_currency),inventory_quantity=p_inventory,sales_start_at=p_sales_start,sales_end_at=p_sales_end,status=p_status,sort_order=greatest(coalesce(p_sort_order,0),0),updated_at=now() where id=p_ticket_id and event_id=p_event_id;
  end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,case when p_ticket_id is null then 'ticket.created' else 'ticket.updated' end,'ticket_type',saved,jsonb_build_object('event_id',p_event_id,'price_minor',p_price_minor,'currency',upper(p_currency),'status',p_status)); return saved;
end; $$;

create or replace function public.create_event_registration(p_event_id uuid,p_ticket_type_id uuid,p_quantity integer,p_attendee_note text,p_manual_reference text,p_manual_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); evt public.events%rowtype; ticket public.ticket_types%rowtype; saved_order uuid; requested integer; order_status text; registration_status text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into evt from public.events where id=p_event_id and status='published' for share;
  if not found then raise exception 'Published event not found'; end if;
  if evt.registration_mode='closed' then raise exception 'Registration is closed'; end if;
  if exists(select 1 from public.registration_requests where event_id=p_event_id and user_id=actor and status not in ('rejected','cancelled')) then raise exception 'You already have a registration for this event'; end if;
  if evt.registration_mode='waitlist' then insert into public.registration_requests(event_id,user_id,status,attendee_note) values(p_event_id,actor,'waitlisted',nullif(trim(p_attendee_note),'')) returning id into saved_order; return saved_order; end if;
  select * into ticket from public.ticket_types where id=p_ticket_type_id and event_id=p_event_id and status='on_sale' for update;
  if not found then raise exception 'Ticket is not available'; end if;
  if p_quantity not between 1 and 10 then raise exception 'Choose between 1 and 10 tickets'; end if;
  if ticket.sales_start_at is not null and ticket.sales_start_at>now() then raise exception 'Ticket sales have not opened'; end if;
  if ticket.sales_end_at is not null and ticket.sales_end_at<now() then raise exception 'Ticket sales have ended'; end if;
  select coalesce(sum(order_items.quantity),0) into requested from public.order_items join public.orders on orders.id=order_items.order_id where order_items.ticket_type_id=ticket.id and orders.status not in ('cancelled','expired','refunded');
  if ticket.inventory_quantity is not null and requested+p_quantity>ticket.inventory_quantity then raise exception 'Not enough tickets remain'; end if;
  order_status:=case when evt.registration_mode='automatic' then 'pending_payment' else 'pending_review' end;
  registration_status:=order_status;
  insert into public.orders(user_id,event_id,status,processing_mode,currency,subtotal_minor,total_minor,reservation_expires_at)
  values(actor,p_event_id,order_status,evt.registration_mode,ticket.currency,ticket.price_minor*p_quantity,ticket.price_minor*p_quantity,case when evt.registration_mode='automatic' then now()+interval '20 minutes' else null end) returning id into saved_order;
  insert into public.order_items(order_id,ticket_type_id,quantity,unit_price_minor,line_total_minor) values(saved_order,ticket.id,p_quantity,ticket.price_minor,ticket.price_minor*p_quantity);
  insert into public.registration_requests(event_id,user_id,order_id,status,attendee_note) values(p_event_id,actor,saved_order,registration_status,nullif(trim(p_attendee_note),''));
  if evt.registration_mode='manual_review' then insert into public.manual_payment_reviews(order_id,submitted_reference,submitter_note) values(saved_order,nullif(trim(p_manual_reference),''),nullif(trim(p_manual_note),'')); end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'registration.created','order',saved_order,jsonb_build_object('event_id',p_event_id,'mode',evt.registration_mode,'total_minor',ticket.price_minor*p_quantity,'currency',ticket.currency)); return saved_order;
end; $$;

create or replace function public.review_manual_registration(p_order_id uuid,p_action text,p_reviewer_note text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); event_id uuid;
begin
  select orders.event_id into event_id from public.orders where id=p_order_id and processing_mode='manual_review' for update;
  if actor is null or event_id is null or not public.can_manage_event(event_id) then raise exception 'Not authorized'; end if;
  if p_action not in ('approve','reject') then raise exception 'Unsupported review action'; end if;
  update public.manual_payment_reviews set status=case when p_action='approve' then 'approved' else 'rejected' end,reviewer_id=actor,reviewer_note=nullif(trim(p_reviewer_note),''),reviewed_at=now(),updated_at=now() where order_id=p_order_id and status='pending';
  if not found then raise exception 'Pending manual review not found'; end if;
  update public.orders set status=case when p_action='approve' then 'approved' else 'cancelled' end,updated_at=now() where id=p_order_id;
  if p_action='reject' then update public.registration_requests set status='rejected',updated_at=now() where order_id=p_order_id; else perform public.fulfill_registration_order(p_order_id,'manual_review'); end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'registration.manual_'||p_action,'order',p_order_id,jsonb_build_object('event_id',event_id,'reviewer_note',nullif(trim(p_reviewer_note),'')));
end; $$;

create or replace function public.list_event_registrations(p_event_id uuid)
returns table(order_id uuid,order_reference text,event_id uuid,user_id uuid,email text,display_name text,status text,processing_mode text,total_minor bigint,currency text,ticket_name text,quantity integer,submitted_reference text,submitter_note text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorized'; end if;
  return query select o.id,o.reference,o.event_id,o.user_id,u.email::text,p.display_name,r.status,o.processing_mode,o.total_minor,o.currency,t.name,oi.quantity,m.submitted_reference,m.submitter_note,o.created_at
  from public.orders o join auth.users u on u.id=o.user_id left join public.profiles p on p.id=o.user_id join public.registration_requests r on r.order_id=o.id join public.order_items oi on oi.order_id=o.id join public.ticket_types t on t.id=oi.ticket_type_id left join public.manual_payment_reviews m on m.order_id=o.id where o.event_id=p_event_id order by o.created_at desc;
end; $$;

revoke all on function public.fulfill_registration_order(uuid,text) from public;
revoke all on function public.save_ticket_type(uuid,uuid,text,text,bigint,text,integer,timestamptz,timestamptz,text,integer) from public; grant execute on function public.save_ticket_type(uuid,uuid,text,text,bigint,text,integer,timestamptz,timestamptz,text,integer) to authenticated;
revoke all on function public.create_event_registration(uuid,uuid,integer,text,text,text) from public; grant execute on function public.create_event_registration(uuid,uuid,integer,text,text,text) to authenticated;
revoke all on function public.review_manual_registration(uuid,text,text) from public; grant execute on function public.review_manual_registration(uuid,text,text) to authenticated;
revoke all on function public.list_event_registrations(uuid) from public; grant execute on function public.list_event_registrations(uuid) to authenticated;
