begin;
-- CLI-created migration reordered after the existing 21:00 dependency.
-- No foreign keys: this manifest must survive album, Community and account deletion.
create table public.community_photo_deletion_queue (
  photo_id uuid primary key,
  community_id uuid not null,
  uploader_id uuid,
  created_at timestamptz not null default now(),
  claim_token uuid,
  leased_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0)
);
alter table public.community_photo_deletion_queue enable row level security;
revoke all on public.community_photo_deletion_queue from public, anon, authenticated;
grant select, insert, update, delete on public.community_photo_deletion_queue to service_role;
create index community_photo_deletion_order_idx on public.community_photo_deletion_queue(created_at, photo_id);
create index community_photo_deletion_uploader_idx on public.community_photo_deletion_queue(uploader_id);

create schema if not exists hat_private;
revoke all on schema hat_private from public, anon, authenticated;
create function hat_private.preserve_community_photo_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_photo_deletion_queue(photo_id, community_id, uploader_id)
  values(old.id, old.community_id, old.uploader_id) on conflict(photo_id) do nothing;
  return old;
end;
$$;
revoke all on function hat_private.preserve_community_photo_deletion() from public, anon, authenticated;
create trigger preserve_community_photo_deletion before delete on public.community_album_photos
for each row execute function hat_private.preserve_community_photo_deletion();

create function public.claim_community_photo_deletions(p_uploader_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item record; token uuid; output jsonb := '[]';
begin
  for item in select q.* from public.community_photo_deletion_queue q
    where (p_uploader_id is null or q.uploader_id = p_uploader_id)
      and (q.leased_until is null or q.leased_until <= now())
    order by q.created_at, q.photo_id limit 10 for update skip locked
  loop
    token := gen_random_uuid();
    update public.community_photo_deletion_queue set claim_token = token,
      leased_until = now() + interval '5 minutes', attempts = attempts + 1 where photo_id = item.photo_id;
    output := output || jsonb_build_array(jsonb_build_object('id', item.photo_id,
      'path', item.community_id::text || '/' || item.photo_id::text, 'token', token));
  end loop;
  return output;
end;
$$;
create function public.finish_community_photo_deletion(p_photo_id uuid, p_claim_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.community_photo_deletion_queue where photo_id = p_photo_id and claim_token = p_claim_token;
  return found;
end;
$$;
-- Ordinary cleanup has already removed Storage files before calling this RPC.
-- Clear the trigger-created manifest in the same transaction, avoiding duplicate jobs.
create or replace function public.finish_community_photo_cleanup(p_photo_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare deleted_id uuid;
begin
  delete from public.community_album_photos where id = p_photo_id and status = 'cleaning' returning id into deleted_id;
  if deleted_id is not null then delete from public.community_photo_deletion_queue where photo_id = deleted_id; end if;
end;
$$;
revoke all on function public.claim_community_photo_deletions(uuid), public.finish_community_photo_deletion(uuid, uuid),
  public.finish_community_photo_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.claim_community_photo_deletions(uuid), public.finish_community_photo_deletion(uuid, uuid),
  public.finish_community_photo_cleanup(uuid) to service_role;
commit;
