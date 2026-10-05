begin;

-- A member invitation is not itself a completed application. Keep ordinary
-- invitees pending after OTP; submit_membership_application decides whether a
-- valid invite can be approved under the current intake setting. Team-role
-- invitations retain their separate, explicitly assigned onboarding route.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_invite public.beta_invites%rowtype;
  initial_status public.member_access_status := 'pending';
begin
  select * into matching_invite
  from public.beta_invites
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1
  for update skip locked;

  if found and matching_invite.intended_role is not null then
    initial_status := 'onboarding';
  end if;

  insert into public.profiles (id, display_name, avatar_url, access_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    initial_status
  );

  if matching_invite.id is not null and matching_invite.intended_role is not null then
    update public.beta_invites
    set status = 'accepted', accepted_by = new.id, accepted_at = now()
    where id = matching_invite.id;

    insert into public.user_roles (user_id, role, granted_by)
    values (new.id, matching_invite.intended_role, matching_invite.invited_by)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
