begin;
create index notification_jobs_dedupe_lookup_idx on public.notification_jobs(dedupe_key,created_at desc);

create or replace function public.notify_connection_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare member_name text; generation text:=extract(epoch from new.updated_at)::text;
begin
  if new.status='pending' and (tg_op='INSERT' or old.status is distinct from new.status) then
    select coalesce(nullif(trim(display_name),''),'A member') into member_name from public.profiles where id=new.requester_id;
    perform public.enqueue_notification(new.recipient_id,'network',left(member_name||' would like to connect',160),
      member_name||' sent you a connection request. View her profile'||case when new.introduction_note is not null then ' and read her private note' else '' end||' before deciding. You can accept or decline; messaging opens only after you accept.',
      '/members/'||new.requester_id||'#connection-request','connection-request:'||new.id||':'||generation);
  elsif tg_op='UPDATE' and old.status is distinct from new.status and new.status='accepted' then
    select coalesce(nullif(trim(display_name),''),'A member') into member_name from public.profiles where id=new.recipient_id;
    perform public.enqueue_notification(new.requester_id,'network',left(member_name||' accepted your request',160),
      'You are now connected with '||member_name||'. You can send a private message from her profile.',
      '/members/'||new.recipient_id,'connection-accepted:'||new.id||':'||generation);
  end if;
  return new;
end; $$;
revoke all on function public.notify_connection_event() from public,anon,authenticated;

create function public.enforce_table_invitation_daily_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.inviter_id::text||':table-invitations',0));
  if (select count(*) from public.table_invitations i where i.inviter_id=new.inviter_id
      and i.created_at>=now()-interval '24 hours' and i.status not in ('rejected','revoked','expired'))>=20 then
    raise exception 'You have reached today''s invitation limit. You can send more tomorrow';
  end if;
  return new;
end; $$;
revoke all on function public.enforce_table_invitation_daily_limit() from public,anon,authenticated;
create trigger enforce_table_invitation_daily_limit before insert on public.table_invitations
for each row execute function public.enforce_table_invitation_daily_limit();

create function public.create_table_invitation_batch(
  p_destination_type text,p_destination_id uuid,p_emails text[],p_personal_note text default null
) returns table(invitation_id uuid,invitee_email text,invitation_status text,created boolean,error_message text)
language plpgsql security definer set search_path='' as $$
declare email_value text; existing public.table_invitations%rowtype; saved record;
begin
  if auth.uid() is null or not public.is_active_member(auth.uid()) then raise exception 'Active membership required'; end if;
  if p_destination_type='community' then
    if not public.can_manage_community(p_destination_id) then raise exception 'Community Host access required'; end if;
  elsif p_destination_type='event' then
    if not public.can_manage_event(p_destination_id) and not exists(select 1 from public.member_event_proposals p where p.canonical_event_id=p_destination_id and p.proposed_by=auth.uid() and p.status='approved') then raise exception 'Event Host access required'; end if;
  else raise exception 'Choose a Community or event'; end if;
  if coalesce(cardinality(p_emails),0) not between 1 and 20 then raise exception 'Add up to 20 email addresses at a time'; end if;
  if exists(select 1 from unnest(p_emails) email where email is null or char_length(trim(email))>320 or lower(trim(email)) !~ '^[^@[:space:],;<>]+@[^@[:space:],;<>]+\.[^@[:space:],;<>]+$') then raise exception 'Check every email address before sending'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':table-invitations',0));
  for email_value in select lower(trim(e)) from unnest(p_emails) with ordinality as emails(e,position) group by lower(trim(e)) order by min(position) loop
    select * into existing from public.table_invitations i where i.inviter_id=auth.uid() and i.invitee_email=email_value
      and i.destination_type=p_destination_type and coalesce(i.community_id,i.event_id)=p_destination_id
      and i.status in ('pending_review','sent','opened','membership_pending','claimed','joined')
      and (i.expires_at is null or i.expires_at>now()) order by i.created_at desc limit 1;
    if found then
      return query select existing.id,email_value,existing.status,false,null::text;
    else
      begin
        select * into saved from public.create_table_invitation(p_destination_type,p_destination_id,email_value,p_personal_note);
        return query select saved.invitation_id,email_value,saved.invitation_status,true,null::text;
      exception when others then
        return query select null::uuid,email_value,'not_created'::text,false,
          case when sqlerrm like 'You have reached today%invitation limit%' then 'Today''s 20-invitation limit has been reached.'
            when sqlerrm='You do not need to invite yourself' then 'This is your own email address.'
            when sqlerrm like '%already has an open invitation%' then 'An invitation already exists for this email.'
            when sqlerrm like '%personal note%' then 'Keep your note between 10 and 600 characters.'
            else 'This invitation could not be saved. Check recent invitations before trying again.' end;
      end;
    end if;
  end loop;
end; $$;
revoke all on function public.create_table_invitation_batch(text,uuid,text[],text) from public,anon;
grant execute on function public.create_table_invitation_batch(text,uuid,text[],text) to authenticated;

create function public.list_my_table_invitation_delivery(p_destination_type text,p_destination_id uuid)
returns table(invitation_id uuid,invitee_email text,invitation_status text,personal_note text,created_at timestamptz,expires_at timestamptz,delivery_status text,delivery_attempts smallint)
language plpgsql stable security definer set search_path='' as $$
begin
  -- Reuse the existing own-invitations projection and current Host checks.
  return query select i.invitation_id,i.invitee_email,i.invitation_status,i.personal_note,i.created_at,i.expires_at,
    coalesce(job.status,'not_sent'),coalesce(job.attempts,0)::smallint
  from public.list_my_table_invitations(p_destination_type,p_destination_id) i
  left join lateral(select j.status,j.attempts from public.notification_jobs j where j.dedupe_key='table-invitation:'||i.invitation_id
    and j.to_email=i.invitee_email order by j.created_at desc limit 1) job on true;
end; $$;
revoke all on function public.list_my_table_invitation_delivery(text,uuid) from public,anon;
grant execute on function public.list_my_table_invitation_delivery(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
