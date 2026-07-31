begin;

create or replace function public.delete_community_comment(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.community_posts%rowtype;
begin
  select *
  into target
  from public.community_posts
  where id = p_comment_id
    and parent_post_id is not null
    and status = 'published'
  for update;

  if not found
    or (
      not public.communities_enabled()
      and not public.can_manage_community(target.community_id)
    )
    or (
      target.author_id <> auth.uid()
      and not public.can_manage_community(target.community_id)
    ) then
    raise exception 'Comment not found';
  end if;

  update public.community_posts
  set
    status = 'deleted',
    body = '[Removed by author]',
    updated_at = now()
  where id = p_comment_id;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    'community.comment_deleted',
    'community_comment',
    p_comment_id,
    jsonb_build_object(
      'community_id', target.community_id,
      'parent_post_id', target.parent_post_id
    )
  );
end;
$$;

revoke all on function public.delete_community_comment(uuid) from public;
grant execute on function public.delete_community_comment(uuid)
  to authenticated;

commit;
