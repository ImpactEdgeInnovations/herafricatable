begin;

insert into public.feature_flags(key, enabled, description)
values(
  'community_acceptance_mode',
  false,
  'Allows only tagged test accounts to rehearse Communities before member launch'
)
on conflict (key) do update
set description = excluded.description;

create or replace function public.communities_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      (select flag.enabled from public.feature_flags flag where flag.key = 'communities'),
      false
    )
    or (
      coalesce(
        (select flag.enabled from public.feature_flags flag where flag.key = 'community_acceptance_mode'),
        false
      )
      and exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.is_test_account
          and profile.access_status = 'active'
      )
    )
$$;

comment on function public.communities_enabled is
  'Returns true for global Community access, or during controlled rehearsal only for the signed-in active tagged test account.';

commit;
