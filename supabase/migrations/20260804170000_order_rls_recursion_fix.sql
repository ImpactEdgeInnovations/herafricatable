begin;

create or replace function public.can_manage_community_order(
  p_order_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.order_items item
    join public.community_offers offer
      on offer.id = item.community_offer_id
    where item.order_id = p_order_id
      and public.can_manage_community(offer.community_id, p_user_id)
  )
$$;

drop policy if exists "Community hosts read community orders"
  on public.orders;
create policy "Community hosts read community orders"
  on public.orders for select
  to authenticated
  using (
    order_type = 'community'
    and public.can_manage_community_order(id, auth.uid())
  );

revoke all on function public.can_manage_community_order(uuid, uuid)
  from public, anon, authenticated;

comment on function public.can_manage_community_order(uuid, uuid) is
  'Internal RLS helper that lets an authorized Community host read a Community order without recursively evaluating order-item policies.';

commit;
