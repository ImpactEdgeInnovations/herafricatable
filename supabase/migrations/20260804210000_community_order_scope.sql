begin;

alter table public.orders
  add column if not exists community_id uuid
  references public.communities(id) on delete restrict;

create index if not exists orders_community_status_idx
  on public.orders(community_id, status, created_at desc)
  where community_id is not null;

update public.orders community_order
set community_id = offer.community_id
from public.order_items item
join public.community_offers offer on offer.id = item.community_offer_id
where item.order_id = community_order.id
  and community_order.community_id is null;

create or replace function public.sync_order_community_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  scoped_community_id uuid;
begin
  if new.community_offer_id is null then return new; end if;
  select offer.community_id into scoped_community_id
  from public.community_offers offer
  where offer.id = new.community_offer_id;
  if scoped_community_id is null then
    raise exception 'Community offer not found';
  end if;
  update public.orders
  set community_id = scoped_community_id, updated_at = now()
  where id = new.order_id
    and (community_id is null or community_id = scoped_community_id);
  if not found then raise exception 'Order Community scope mismatch'; end if;
  return new;
end;
$$;

drop trigger if exists sync_order_community_scope_after_write
  on public.order_items;
create trigger sync_order_community_scope_after_write
after insert or update of community_offer_id on public.order_items
for each row execute function public.sync_order_community_scope();

drop policy if exists "Community hosts read community orders"
  on public.orders;
create policy "Community hosts read community orders"
  on public.orders for select
  to authenticated
  using (
    order_type = 'community'
    and community_id is not null
    and public.can_manage_community(community_id, auth.uid())
  );

revoke all on function public.sync_order_community_scope() from public;

comment on column public.orders.community_id is
  'Direct Community authorization scope synchronized from a Community order item to keep order RLS non-recursive.';

commit;
