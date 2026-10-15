begin;
create or replace function public.publish_pilot_proposal_poster() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin
  if new.owner_id=auth.uid() and new.status='submitted' then
    if new.context_type='member_event_proposal' then
      select canonical_event_id into event_id from public.member_event_proposals where id=new.context_id;
      if public.can_self_publish_pilot_event(event_id) then new.status:='approved';new.reviewed_by:=auth.uid();new.reviewed_at:=now();end if;
    elsif new.context_type='community_application' and public.community_pilot_member_ready(auth.uid()) and exists(
      select 1 from public.community_host_applications a join public.community_pilot_publications pilot on pilot.community_id=a.created_community_id where a.id=new.context_id and a.applicant_id=auth.uid() and a.status='approved'
    ) then new.status:='approved';new.reviewed_by:=auth.uid();new.reviewed_at:=now();end if;
  end if;
  return new;
end; $$;
revoke all on function public.publish_pilot_proposal_poster() from public,anon,authenticated;

create function public.can_read_community_creation_image(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_active_member(auth.uid()) and public.communities_enabled() and exists(
    select 1 from public.application_proposal_media m join public.community_host_applications a on a.id=m.context_id join public.communities c on c.id=a.created_community_id
    where m.storage_path=p_path and m.context_type='community_application' and m.status='approved' and m.is_current and a.status='approved' and (c.status='published' or public.can_manage_community(c.id))
  );
$$;
revoke all on function public.can_read_community_creation_image(text) from public,anon;
grant execute on function public.can_read_community_creation_image(text) to authenticated;
create policy "Members read approved Community creation images" on storage.objects for select to authenticated using (bucket_id='proposal-media' and public.can_read_community_creation_image(name));

create function public.list_community_creation_images(p_community_id uuid default null)
returns table(community_id uuid,storage_path text,alt_text text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_active_member(auth.uid()) or not public.communities_enabled() then raise exception 'Active membership required'; end if;
  return query select c.id,m.storage_path,m.alt_text from public.application_proposal_media m join public.community_host_applications a on a.id=m.context_id join public.communities c on c.id=a.created_community_id where m.context_type='community_application' and m.status='approved' and m.is_current and a.status='approved' and (p_community_id is null or c.id=p_community_id) and (c.status='published' or public.can_manage_community(c.id));
end; $$;
revoke all on function public.list_community_creation_images(uuid) from public,anon;
grant execute on function public.list_community_creation_images(uuid) to authenticated;
notify pgrst,'reload schema';
create function public.list_community_host_activity(p_community_id uuid,p_kind text)
returns table(item_id uuid,title text,body text,created_at timestamptz,href text)
language plpgsql stable security definer set search_path='' as $$
declare slug text;
begin
  if auth.uid() is null or not public.communities_enabled() or not public.can_manage_community(p_community_id) then raise exception 'Community Host access required'; end if;
  select c.slug into slug from public.communities c where c.id=p_community_id;
  if p_kind='events' then
    return query select e.id,e.title::text,coalesce(e.summary,'')::text,e.starts_at,'/communities/'||slug||'?view=gatherings&gathering='||e.slug
    from public.community_event_links l join public.events e on e.id=l.event_id where l.community_id=p_community_id and e.status='published' and e.ends_at>=now() order by e.starts_at,e.id limit 50;
  elsif p_kind in ('posts','replies','asks') then
    return query select p.id,coalesce(author.display_name,'Member')::text,left(p.body,3000),p.created_at,'/communities/'||slug||'?view=conversations#conversation-'||coalesce(p.parent_post_id,p.id)
    from public.community_posts p join public.profiles author on author.id=p.author_id
    where p.community_id=p_community_id and p.status='published' and author.access_status='active' and not coalesce(author.is_test_account,false)
      and case when p_kind='replies' then p.parent_post_id is not null and p.created_at>=now()-interval '7 days'
        when p_kind='asks' then p.parent_post_id is null and p.category='ask' and not exists(select 1 from public.community_posts reply where reply.parent_post_id=p.id and reply.status='published')
        else p.parent_post_id is null and p.created_at>=now()-interval '7 days' end
    order by p.created_at desc,p.id limit 50;
  else raise exception 'Choose posts, replies, questions or events'; end if;
end; $$;
revoke all on function public.list_community_host_activity(uuid,text) from public,anon;
grant execute on function public.list_community_host_activity(uuid,text) to authenticated;
commit;
