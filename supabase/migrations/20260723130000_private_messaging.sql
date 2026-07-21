create table public.conversations (
  id uuid primary key default gen_random_uuid(), connection_id uuid not null unique references public.connections(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz, muted boolean not null default false, joined_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 4000),
  status text not null default 'sent' check(status in ('sent','deleted')),
  created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz
);
create index messages_conversation_created_idx on public.messages(conversation_id,created_at desc);
create index conversation_participants_user_idx on public.conversation_participants(user_id,conversation_id);
alter table public.conversations enable row level security; alter table public.conversation_participants enable row level security; alter table public.messages enable row level security;

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.conversations cv join public.connections c on c.id=cv.connection_id
  join public.conversation_participants cp on cp.conversation_id=cv.id and cp.user_id=auth.uid()
  where cv.id=p_conversation_id and c.status='accepted' and not public.is_blocked_pair(c.user_low,c.user_high)
    and public.is_active_member(c.user_low) and public.is_active_member(c.user_high)
 );
$$;
create policy "Participants read accessible conversations" on public.conversations for select to authenticated using(public.can_access_conversation(id));
create policy "Participants read conversation membership" on public.conversation_participants for select to authenticated using(public.can_access_conversation(conversation_id));
create policy "Participants read accessible messages" on public.messages for select to authenticated using(public.can_access_conversation(conversation_id));

create or replace function public.ensure_conversation(p_connection_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.connections%rowtype; saved uuid;
begin
 select * into target from public.connections where id=p_connection_id and actor in(user_low,user_high) and status='accepted' for update;
 if not found or not public.is_active_member(actor) or public.is_blocked_pair(target.user_low,target.user_high) then raise exception 'Accepted unblocked connection required'; end if;
 insert into public.conversations(connection_id) values(target.id) on conflict(connection_id) do update set updated_at=conversations.updated_at returning id into saved;
 insert into public.conversation_participants(conversation_id,user_id) values(saved,target.user_low),(saved,target.user_high) on conflict do nothing;
 return saved;
end; $$;

create or replace function public.send_message(p_conversation_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); saved uuid;
begin
 if not public.can_access_conversation(p_conversation_id) then raise exception 'Conversation is unavailable'; end if;
 if nullif(trim(p_body),'') is null or char_length(trim(p_body))>4000 then raise exception 'Message must contain between 1 and 4000 characters'; end if;
 if (select count(*) from public.messages where sender_id=actor and created_at>now()-interval '1 hour')>=120 then raise exception 'Message rate limit reached'; end if;
 insert into public.messages(conversation_id,sender_id,body) values(p_conversation_id,actor,trim(p_body)) returning id into saved;
 update public.conversations set updated_at=now() where id=p_conversation_id;
 update public.conversation_participants set last_read_at=now() where conversation_id=p_conversation_id and user_id=actor;
 return saved;
end; $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.can_access_conversation(p_conversation_id) then raise exception 'Conversation is unavailable'; end if;
 update public.conversation_participants set last_read_at=now() where conversation_id=p_conversation_id and user_id=auth.uid();
end; $$;

create or replace function public.list_my_conversations()
returns table(conversation_id uuid,connection_id uuid,other_user_id uuid,display_name text,avatar_url text,job_title text,company text,last_message text,last_message_at timestamptz,unread_count bigint)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_active_member(auth.uid()) then raise exception 'Active visible membership required'; end if;
 return query select cv.id,c.id,p.id,p.display_name,p.avatar_url,p.job_title,p.company,
  (select case when m.status='deleted' then 'Message removed' else m.body end from public.messages m where m.conversation_id=cv.id order by m.created_at desc limit 1),
  (select m.created_at from public.messages m where m.conversation_id=cv.id order by m.created_at desc limit 1),
  (select count(*) from public.messages m where m.conversation_id=cv.id and m.sender_id<>auth.uid() and m.status='sent' and m.created_at>coalesce(cp.last_read_at,'epoch'::timestamptz))
 from public.conversations cv join public.connections c on c.id=cv.connection_id join public.conversation_participants cp on cp.conversation_id=cv.id and cp.user_id=auth.uid()
 join public.profiles p on p.id=case when c.user_low=auth.uid() then c.user_high else c.user_low end
 where public.can_access_conversation(cv.id) order by coalesce((select max(m.created_at) from public.messages m where m.conversation_id=cv.id),cv.created_at) desc;
end; $$;

create or replace function public.list_conversation_messages(p_conversation_id uuid,p_before timestamptz default null,p_limit integer default 50)
returns table(message_id uuid,sender_id uuid,body text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.can_access_conversation(p_conversation_id) then raise exception 'Conversation is unavailable'; end if;
 return query select m.id,m.sender_id,case when m.status='deleted' then 'Message removed' else m.body end,m.status,m.created_at from public.messages m where m.conversation_id=p_conversation_id and (p_before is null or m.created_at<p_before) order by m.created_at desc limit least(greatest(coalesce(p_limit,50),1),100);
end; $$;

create or replace function public.delete_own_message(p_message_id uuid)
returns void language plpgsql security definer set search_path='' as $$ begin
 update public.messages set body='Message removed',status='deleted',deleted_at=now() where id=p_message_id and sender_id=auth.uid() and status='sent';
 if not found then raise exception 'Message not found'; end if;
end; $$;

alter table public.member_reports add column message_id uuid references public.messages(id) on delete set null;
create or replace function public.report_message(p_message_id uuid,p_category text,p_details text,p_block_sender boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.messages%rowtype; connection_row public.connections%rowtype; saved uuid; snapshot jsonb;
begin
 select * into target from public.messages where id=p_message_id and sender_id<>actor and public.can_access_conversation(conversation_id);
 if not found then raise exception 'Message is unavailable'; end if;
 if p_category not in ('harassment','spam','misrepresentation','privacy','safety','other') or char_length(trim(coalesce(p_details,'')))<10 then raise exception 'Valid category and details are required'; end if;
 select c.* into connection_row from public.conversations cv join public.connections c on c.id=cv.connection_id where cv.id=target.conversation_id;
 if exists(select 1 from public.member_reports where reporter_id=actor and message_id=p_message_id and status in('open','reviewing')) then raise exception 'This message is already under review'; end if;
 snapshot:=jsonb_build_object('message_id',target.id,'body',target.body,'sender_id',target.sender_id,'sent_at',target.created_at,'captured_at',now());
 insert into public.member_reports(reporter_id,target_user_id,connection_id,message_id,category,details,evidence_snapshot) values(actor,target.sender_id,connection_row.id,target.id,p_category,trim(p_details),snapshot) returning id into saved;
 if p_block_sender then perform public.block_member(target.sender_id,'Blocked while reporting a message'); end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata) values(actor,'message.reported','member_report',saved,jsonb_build_object('message_id',target.id,'target_user_id',target.sender_id)); return saved;
end; $$;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
end $$;

revoke all on function public.can_access_conversation(uuid) from public;grant execute on function public.can_access_conversation(uuid) to authenticated;
revoke all on function public.ensure_conversation(uuid) from public;grant execute on function public.ensure_conversation(uuid) to authenticated;
revoke all on function public.send_message(uuid,text) from public;grant execute on function public.send_message(uuid,text) to authenticated;
revoke all on function public.mark_conversation_read(uuid) from public;grant execute on function public.mark_conversation_read(uuid) to authenticated;
revoke all on function public.list_my_conversations() from public;grant execute on function public.list_my_conversations() to authenticated;
revoke all on function public.list_conversation_messages(uuid,timestamptz,integer) from public;grant execute on function public.list_conversation_messages(uuid,timestamptz,integer) to authenticated;
revoke all on function public.delete_own_message(uuid) from public;grant execute on function public.delete_own_message(uuid) to authenticated;
revoke all on function public.report_message(uuid,text,text,boolean) from public;grant execute on function public.report_message(uuid,text,text,boolean) to authenticated;
