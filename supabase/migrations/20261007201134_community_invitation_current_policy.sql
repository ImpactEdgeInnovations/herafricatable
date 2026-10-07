begin;
create or replace function public.resume_table_invitations_after_activation()
returns trigger language plpgsql security definer set search_path='' as $$
declare invitation public.table_invitations%rowtype; community public.communities%rowtype;
  paid_offer boolean; next_status text; destination record; existing public.community_memberships%rowtype; changed boolean;
begin
  if new.access_status<>'active' or old.access_status is not distinct from 'active' then return new; end if;
  for invitation in select * from public.table_invitations pending where pending.invitee_user_id=new.id
    and pending.status='membership_pending' and pending.expires_at>now() for update
  loop
    select * into destination from public.table_invitation_destination(invitation.destination_type,invitation.community_id,invitation.event_id);
    if not found then continue; end if;
    if invitation.destination_type='community' then
      if not public.communities_enabled() then continue; end if;
      select * into community from public.communities where id=invitation.community_id and status='published' for update;
      if not found then continue; end if;
      select * into existing from public.community_memberships where community_id=community.id and user_id=new.id for update;
      -- A previous removal/decline cannot be undone by an older invitation.
      if existing.status in ('removed','declined') and (invitation.sent_at is null or existing.updated_at>=invitation.sent_at) then continue; end if;
      if community.join_policy='invite_only' and not public.can_manage_community(community.id,invitation.inviter_id) then continue; end if;
      select exists(select 1 from public.community_offers offer where offer.community_id=community.id and offer.status='published' and offer.access_type='paid') into paid_offer;
      next_status:=case when community.join_policy='approval' then 'requested'
        when paid_offer and not public.has_current_community_access(community.id,new.id) then 'approved_pending_payment' else 'active' end;
      insert into public.community_memberships(community_id,user_id,role,status,joined_at)
      values(community.id,new.id,'member',next_status,case when next_status='active' then now() end)
      on conflict(community_id,user_id) do update set
        role=case when public.community_memberships.status='invited' then public.community_memberships.role else 'member' end,
        status=excluded.status,joined_at=case when excluded.status='active' then coalesce(public.community_memberships.joined_at,now()) else public.community_memberships.joined_at end,
        updated_at=now()
      where public.community_memberships.status in ('invited','declined','removed');
      changed:=found;
      select status into next_status from public.community_memberships where community_id=community.id and user_id=new.id;
      if changed then
        perform public.enqueue_notification(host.user_id,'community',
          case when next_status='active' then 'A member joined '||community.name else 'New request to join '||community.name end,
          coalesce(nullif(trim(new.display_name),''),'A member')||case when next_status='active' then ' joined through your invitation.' else ' would like to join through your invitation.' end,
          '/communities/'||community.slug||'/host#admissions','table-invitation-community:'||invitation.id||':'||host.user_id)
        from public.community_memberships host where host.community_id=community.id and host.status='active' and host.role in ('owner','moderator') and host.user_id<>new.id;
      end if;
      update public.table_invitations set status='joined',joined_at=now(),claimed_at=coalesce(claimed_at,now()),updated_at=now() where id=invitation.id;
      perform public.enqueue_notification(new.id,'community',
        case when next_status='active' then 'Your Community is ready' when next_status='approved_pending_payment' then 'Complete your Community membership' else 'Your Community request is ready' end,
        case when next_status='active' then 'Open your Community to meet members and join the conversation.' when next_status='approved_pending_payment' then 'Open the Community to see its membership payment options.' else 'Your request is with the Community Host. We will let you know when it is approved.' end,
        destination.destination_href,'table-invitation-resumed:'||invitation.id);
    else
      update public.table_invitations set status='claimed',claimed_at=coalesce(claimed_at,now()),updated_at=now() where id=invitation.id;
      perform public.enqueue_notification(new.id,'event','Your event invitation is ready','Your membership is active. Choose your ticket or request your seat on the event page.',destination.destination_href,'table-invitation-resumed:'||invitation.id);
    end if;
  end loop;
  return new;
end; $$;
-- Only its attached trigger needs to execute this function.
revoke all on function public.resume_table_invitations_after_activation() from public,anon,authenticated;
commit;
