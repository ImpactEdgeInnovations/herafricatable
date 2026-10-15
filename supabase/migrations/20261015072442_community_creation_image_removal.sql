begin;
alter table public.communities
  add column creation_icon_hidden boolean not null default false,
  add column creation_cover_hidden boolean not null default false;

create function public.save_community_brand_with_creation_image(
  p_community_id uuid, p_tagline text, p_accent_key text,
  p_icon_storage_path text default null, p_icon_mime_type text default null,
  p_icon_original_name text default null, p_icon_alt_text text default null,
  p_icon_width integer default null, p_icon_height integer default null,
  p_icon_size_bytes bigint default null, p_remove_icon boolean default false,
  p_cover_storage_path text default null, p_cover_mime_type text default null,
  p_cover_original_name text default null, p_cover_alt_text text default null,
  p_cover_width integer default null, p_cover_height integer default null,
  p_cover_size_bytes bigint default null, p_remove_cover boolean default false
) returns void language plpgsql security definer set search_path='' as $$
begin
  -- Existing API supplies ownership checks, validation, locking and audit.
  perform public.save_community_brand_identity(
    p_community_id,p_tagline,p_accent_key,p_icon_storage_path,p_icon_mime_type,
    p_icon_original_name,p_icon_alt_text,p_icon_width,p_icon_height,p_icon_size_bytes,
    p_remove_icon,p_cover_storage_path,p_cover_mime_type,p_cover_original_name,
    p_cover_alt_text,p_cover_width,p_cover_height,p_cover_size_bytes,p_remove_cover);
  update public.communities set
    creation_icon_hidden=case when p_remove_icon then true else creation_icon_hidden end,
    creation_cover_hidden=case when p_remove_cover then true else creation_cover_hidden end
  where id=p_community_id;
end; $$;
revoke all on function public.save_community_brand_with_creation_image(uuid,text,text,text,text,text,text,integer,integer,bigint,boolean,text,text,text,text,integer,integer,bigint,boolean) from public,anon;
grant execute on function public.save_community_brand_with_creation_image(uuid,text,text,text,text,text,text,integer,integer,bigint,boolean,text,text,text,text,integer,integer,bigint,boolean) to authenticated;

drop function public.list_community_creation_images(uuid);
create function public.list_community_creation_images(p_community_id uuid default null)
returns table(community_id uuid,storage_path text,alt_text text,icon_hidden boolean,cover_hidden boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_active_member(auth.uid()) or not public.communities_enabled() then raise exception 'Active membership required'; end if;
  return query select c.id,m.storage_path,m.alt_text,c.creation_icon_hidden,c.creation_cover_hidden
  from public.application_proposal_media m
  join public.community_host_applications a on a.id=m.context_id
  join public.communities c on c.id=a.created_community_id
  where m.context_type='community_application' and m.status='approved' and m.is_current
    and a.status='approved' and (p_community_id is null or c.id=p_community_id)
    and (c.status='published' or public.can_manage_community(c.id));
end; $$;
revoke all on function public.list_community_creation_images(uuid) from public,anon;
grant execute on function public.list_community_creation_images(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
