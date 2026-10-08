begin;

-- NULL means the Host has not chosen yet; do not infer a location from a name.
alter table public.communities add column if not exists location_scope text;
alter table public.communities add column if not exists location_label text;
alter table public.community_host_applications add column if not exists location_scope text;
alter table public.community_host_applications add column if not exists location_label text;
do $$
declare target text;
begin
  foreach target in array array['communities','community_host_applications'] loop
    if not exists(select 1 from pg_constraint where conname = target || '_location_check'
      and conrelid = ('public.' || target)::regclass) then
      execute format('alter table public.%I add constraint %I check (
        (location_scope is null and location_label is null) or
        (location_scope is not null and (
          (location_scope = ''global'' and location_label is null) or
          (location_scope = ''place'' and location_label is not null and char_length(location_label) between 2 and 100)
        ))
      )',target,target || '_location_check');
    end if;
  end loop;
end;
$$;

create or replace function public.validate_community_location(p_scope text, p_label text)
returns text language plpgsql immutable set search_path = '' as $$
declare label text := nullif(regexp_replace(btrim(p_label), '\s+', ' ', 'g'), '');
begin
  if p_scope is null or p_scope not in ('global','place') then
    raise exception 'Choose Global / online or a specific place';
  end if;
  if p_scope = 'global' then return null; end if;
  if label is null or char_length(label) not between 2 and 100 then
    raise exception 'Enter a place name between 2 and 100 characters';
  end if;
  return label;
end;
$$;
revoke all on function public.validate_community_location(text,text) from public,anon,authenticated;

create or replace function public.sync_approved_community_location()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and new.created_community_id is not null and new.location_scope is not null then
    update public.communities set location_scope = new.location_scope,
      location_label = new.location_label where id = new.created_community_id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_approved_community_location() from public,anon,authenticated;
drop trigger if exists sync_approved_community_location on public.community_host_applications;
create trigger sync_approved_community_location
after insert or update of status,created_community_id,location_scope,location_label
on public.community_host_applications for each row execute function public.sync_approved_community_location();

-- Keep the existing admission, review and pilot controls authoritative.
-- Details and location save in one transaction; failure rolls both back.
create or replace function public.save_community_host_application_with_location(
  p_application_id uuid, p_community_name text, p_category text,
  p_purpose text, p_intended_members text, p_expected_members integer,
  p_admission_model text, p_host_experience text, p_safety_plan text,
  p_applicant_message text, p_accept_guidelines boolean,
  p_location_scope text, p_location_label text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved uuid; clean_label text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  clean_label := public.validate_community_location(p_location_scope,p_location_label);
  saved := public.save_community_host_application(p_application_id,p_community_name,p_category,
    p_purpose,p_intended_members,p_expected_members,p_admission_model,p_host_experience,
    p_safety_plan,p_applicant_message,p_accept_guidelines);
  update public.community_host_applications set location_scope = p_location_scope,
    location_label = clean_label where id = saved and applicant_id = auth.uid();
  return saved;
end;
$$;
revoke all on function public.save_community_host_application_with_location(uuid,text,text,text,text,integer,text,text,text,text,boolean,text,text) from public,anon;
grant execute on function public.save_community_host_application_with_location(uuid,text,text,text,text,integer,text,text,text,text,boolean,text,text) to authenticated;

create or replace function public.list_community_locations()
returns table(community_id uuid,location_scope text,location_label text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  return query select c.id,c.location_scope,c.location_label
  from public.communities c
  join public.list_communities() visible on visible.community_id = c.id;
end;
$$;
revoke all on function public.list_community_locations() from public,anon;
grant execute on function public.list_community_locations() to authenticated;

create or replace function public.save_community_location(p_community_id uuid,p_location_scope text,p_location_label text)
returns void language plpgsql security definer set search_path = '' as $$
declare clean_label text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not public.is_admin(array['super_admin']::public.app_role[])
    and not exists (select 1 from public.community_memberships m
      where m.community_id = p_community_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role = 'owner') then
    raise exception 'Community owner or Super Admin required';
  end if;
  clean_label := public.validate_community_location(p_location_scope,p_location_label);
  update public.communities set location_scope = p_location_scope,location_label = clean_label,
    updated_at = now() where id = p_community_id;
  if not found then raise exception 'Community not found'; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'community.location_changed','community',p_community_id,
    jsonb_build_object('scope',p_location_scope,'place',clean_label));
end;
$$;
revoke all on function public.save_community_location(uuid,text,text) from public,anon;
grant execute on function public.save_community_location(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
