begin;
-- Depends on the scoped founding-pilot publishing functions.

alter function public.create_table_invitation(text,uuid,text,text) rename to create_table_invitation_reviewed;
revoke all on function public.create_table_invitation_reviewed(text,uuid,text,text) from public, anon, authenticated;
create or replace function public.create_table_invitation(
  p_destination_type text,p_destination_id uuid,p_email text,p_personal_note text default null
)
returns table(invitation_id uuid,invitation_status text,invitation_url text)
language plpgsql security definer set search_path = '', extensions as $$
declare saved record; eligible boolean; raw_token text; destination record; actor_name text;
begin
  select * into saved from public.create_table_invitation_reviewed(
    p_destination_type,p_destination_id,p_email,p_personal_note);
  eligible := case p_destination_type
    when 'event' then public.can_self_publish_pilot_event(p_destination_id)
    when 'community' then public.community_pilot_member_ready(auth.uid())
      and exists (select 1 from public.community_pilot_publications pilot
        join public.communities community on community.id=pilot.community_id
        where pilot.community_id=p_destination_id and pilot.owner_id=auth.uid() and community.status='published')
    else false end;
  if saved.invitation_status='pending_review' and eligible then
    raw_token := encode(extensions.gen_random_bytes(32),'hex');
    update public.table_invitations set status='sent',
      token_hash=encode(extensions.digest(raw_token,'sha256'),'hex'),
      sent_at=now(),expires_at=now()+interval '30 days',updated_at=now()
      where id=saved.invitation_id and inviter_id=auth.uid();
    select * into destination from public.table_invitation_destination(
      p_destination_type,case when p_destination_type='community' then p_destination_id end,
      case when p_destination_type='event' then p_destination_id end);
    select coalesce(nullif(trim(display_name),''),'A Her Africa Table member') into actor_name
      from public.profiles where id=auth.uid();
    insert into public.notification_jobs(user_id,template_key,to_email,payload,dedupe_key)
      values(auth.uid(),'table_invitation',lower(trim(p_email)),jsonb_build_object(
        'title',actor_name || ' invited you to ' || destination.destination_name,
        'body',coalesce(nullif(trim(p_personal_note),''),'Join Her Africa Table and continue to this ' || p_destination_type || '.'),
        'href','/join/' || raw_token),'table-invitation:' || saved.invitation_id)
      on conflict(user_id,channel,dedupe_key) do nothing;
    update public.notifications set title='Pilot invitation sent',
      body=actor_name || ' sent an invitation to ' || destination.destination_name || '.',href='/admin/invitations'
      where dedupe_key like 'table-invitation-review:' || saved.invitation_id || ':%';
    update public.notification_jobs set payload=payload || jsonb_build_object(
      'title','Pilot invitation sent','body',actor_name || ' sent an invitation to ' || destination.destination_name || '.')
      where dedupe_key like 'table-invitation-review:' || saved.invitation_id || ':%' and status='queued';
    insert into public.audit_events(actor_id,action,target_type,target_id)
      values(auth.uid(),'table_invitation.pilot_sent','table_invitation',saved.invitation_id);
    return query select saved.invitation_id,'sent'::text,null::text;
  else
    return query select saved.invitation_id,saved.invitation_status,null::text;
  end if;
end;
$$;
revoke all on function public.create_table_invitation(text,uuid,text,text) from public, anon;
grant execute on function public.create_table_invitation(text,uuid,text,text) to authenticated;

create or replace function public.publish_pilot_existing_poster()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='approved' and new.pilot_auto_draft and new.canonical_event_id is not null
    and auth.uid()=new.proposed_by and public.can_self_publish_pilot_event(new.canonical_event_id) then
    update public.application_proposal_media set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
      where context_type='member_event_proposal' and context_id=new.id and owner_id=auth.uid()
        and status='submitted' and is_current;
  end if;
  return new;
end;
$$;
revoke all on function public.publish_pilot_existing_poster() from public, anon, authenticated;
create trigger publish_pilot_existing_poster after update of canonical_event_id,pilot_auto_draft
on public.member_event_proposals for each row execute function public.publish_pilot_existing_poster();

notify pgrst, 'reload schema';
commit;
