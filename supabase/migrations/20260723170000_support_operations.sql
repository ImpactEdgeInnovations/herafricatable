begin;

create table public.support_tickets (
 id uuid primary key default gen_random_uuid(),reference text not null unique default('SUP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
 requester_id uuid not null references auth.users(id) on delete cascade,category text not null check(category in('account','registration','payment','event','safety','privacy','technical','other')),
 subject text not null check(char_length(subject) between 5 and 160),description text not null check(char_length(description) between 10 and 4000),
 status text not null default'open' check(status in('open','in_progress','waiting_member','resolved','closed')),
 priority text not null default'normal' check(priority in('low','normal','high','urgent')),assigned_to uuid references auth.users(id) on delete set null,
 response_due_at timestamptz not null default(now()+interval'24 hours'),first_response_at timestamptz,resolved_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.support_messages(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,body text not null check(char_length(body) between 1 and 4000),
 is_staff boolean not null default false,created_at timestamptz not null default now()
);
create index support_tickets_requester_idx on public.support_tickets(requester_id,updated_at desc);
create index support_tickets_status_priority_idx on public.support_tickets(status,priority,updated_at desc);
create index support_messages_ticket_idx on public.support_messages(ticket_id,created_at);
alter table public.support_tickets enable row level security;alter table public.support_messages enable row level security;
create policy "Members read own support tickets" on public.support_tickets for select to authenticated using(requester_id=auth.uid());
create policy "Super admins read support tickets" on public.support_tickets for select to authenticated using(public.is_admin(array['super_admin']::public.app_role[]));
create policy "Members read own support replies" on public.support_messages for select to authenticated using(exists(select 1 from public.support_tickets where support_tickets.id=support_messages.ticket_id and support_tickets.requester_id=auth.uid()));
create policy "Super admins read support replies" on public.support_messages for select to authenticated using(public.is_admin(array['super_admin']::public.app_role[]));

create or replace function public.create_support_ticket(p_category text,p_subject text,p_description text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();saved uuid;
begin
 if actor is null then raise exception 'Authentication required';end if;
 if p_category not in('account','registration','payment','event','safety','privacy','technical','other') then raise exception 'Unsupported support category';end if;
 if char_length(trim(coalesce(p_subject,'')))<5 or char_length(trim(coalesce(p_description,'')))<10 then raise exception 'Subject and description require more detail';end if;
 if(select count(*) from public.support_tickets where requester_id=actor and created_at>now()-interval'24 hours')>=10 then raise exception 'Daily support request limit reached';end if;
 insert into public.support_tickets(requester_id,category,subject,description,priority,response_due_at) values(actor,p_category,trim(p_subject),trim(p_description),case when p_category in('safety','privacy','payment') then'high' else'normal'end,now()+case when p_category in('safety','privacy','payment')then interval'4 hours'else interval'24 hours'end) returning id into saved;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'support.created','support_ticket',saved,jsonb_build_object('category',p_category));return saved;
end;$$;

create or replace function public.reply_support_ticket(p_ticket_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();ticket public.support_tickets%rowtype;saved uuid;staff boolean;
begin
 select * into ticket from public.support_tickets where id=p_ticket_id for update;
 staff:=public.is_admin(array['super_admin']::public.app_role[]);
 if actor is null or ticket.id is null or(actor<>ticket.requester_id and not staff)then raise exception 'Support ticket unavailable';end if;
 if ticket.status='closed'then raise exception 'Closed tickets cannot receive replies';end if;
 if nullif(trim(p_body),'')is null or char_length(trim(p_body))>4000 then raise exception 'Reply must contain between 1 and 4000 characters';end if;
 if(select count(*)from public.support_messages where author_id=actor and created_at>now()-interval'1 hour')>=60 then raise exception 'Reply rate limit reached';end if;
 insert into public.support_messages(ticket_id,author_id,body,is_staff)values(ticket.id,actor,trim(p_body),staff)returning id into saved;
 update public.support_tickets set status=case when staff then'waiting_member'when assigned_to is not null then'in_progress'else'open'end,first_response_at=case when staff then coalesce(first_response_at,now())else first_response_at end,updated_at=now()where id=ticket.id;
 return saved;
end;$$;

create or replace function public.manage_support_ticket(p_ticket_id uuid,p_status text,p_priority text,p_assignee_email text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();assignee uuid;
begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception 'Super admin required';end if;
 if p_status not in('open','in_progress','waiting_member','resolved','closed')or p_priority not in('low','normal','high','urgent')then raise exception 'Unsupported support state';end if;
 if nullif(trim(p_assignee_email),'')is not null then select u.id into assignee from auth.users u join public.user_roles r on r.user_id=u.id and r.role='super_admin' where lower(u.email)=lower(trim(p_assignee_email));if assignee is null then raise exception 'Assignee must be a super admin';end if;end if;
 update public.support_tickets set status=p_status,priority=p_priority,assigned_to=assignee,response_due_at=case when first_response_at is null then now()+case p_priority when'urgent'then interval'1 hour'when'high'then interval'4 hours'when'normal'then interval'24 hours'else interval'48 hours'end else response_due_at end,resolved_at=case when p_status in('resolved','closed')then coalesce(resolved_at,now())else null end,updated_at=now()where id=p_ticket_id;
 if not found then raise exception 'Support ticket not found';end if;
 if nullif(trim(p_note),'')is not null then insert into public.support_messages(ticket_id,author_id,body,is_staff)values(p_ticket_id,actor,trim(p_note),true);end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'support.managed','support_ticket',p_ticket_id,jsonb_build_object('status',p_status,'priority',p_priority,'assigned_to',assignee));
end;$$;

create or replace function public.list_admin_support_tickets()
returns table(ticket_id uuid,reference text,requester_id uuid,email text,display_name text,category text,subject text,description text,status text,priority text,assigned_email text,response_due_at timestamptz,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception 'Super admin required';end if;
 return query select t.id,t.reference,t.requester_id,u.email::text,p.display_name,t.category,t.subject,t.description,t.status,t.priority,au.email::text,t.response_due_at,t.created_at,t.updated_at from public.support_tickets t join auth.users u on u.id=t.requester_id left join public.profiles p on p.id=t.requester_id left join auth.users au on au.id=t.assigned_to order by case t.status when'open'then 0 when'in_progress'then 1 when'waiting_member'then 2 else 3 end,case t.priority when'urgent'then 0 when'high'then 1 when'normal'then 2 else 3 end,t.updated_at;
end;$$;

do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime')and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'and schemaname='public'and tablename='support_messages')then alter publication supabase_realtime add table public.support_messages;end if;end$$;
revoke all on function public.create_support_ticket(text,text,text)from public;grant execute on function public.create_support_ticket(text,text,text)to authenticated;
revoke all on function public.reply_support_ticket(uuid,text)from public;grant execute on function public.reply_support_ticket(uuid,text)to authenticated;
revoke all on function public.manage_support_ticket(uuid,text,text,text,text)from public;grant execute on function public.manage_support_ticket(uuid,text,text,text,text)to authenticated;
revoke all on function public.list_admin_support_tickets()from public;grant execute on function public.list_admin_support_tickets()to authenticated;

commit;
