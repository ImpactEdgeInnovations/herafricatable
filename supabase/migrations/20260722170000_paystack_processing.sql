create or replace function public.record_payment_initialization(
  p_order_id uuid, p_provider_reference text, p_authorization_url text, p_provider_response jsonb
)
returns void language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype;
begin
  select * into target from public.orders where id=p_order_id and user_id=auth.uid() for update;
  if not found or target.status<>'pending_payment' or target.processing_mode<>'automatic' then raise exception 'Payable order not found'; end if;
  if nullif(trim(p_provider_reference),'') is null or nullif(trim(p_authorization_url),'') is null then raise exception 'Invalid provider initialization'; end if;
  insert into public.payment_attempts(order_id,provider,provider_reference,amount_minor,currency,status,authorization_url,provider_response)
  values(target.id,'paystack',trim(p_provider_reference),target.total_minor,target.currency,'initialized',trim(p_authorization_url),coalesce(p_provider_response,'{}'::jsonb))
  on conflict(provider_reference) do update set authorization_url=excluded.authorization_url,provider_response=excluded.provider_response,updated_at=now();
end; $$;

create or replace function public.process_paystack_payment(
  p_provider_event_id text,p_event_type text,p_reference text,p_status text,p_amount_minor bigint,p_currency text,p_payload jsonb,p_signature_verified boolean
)
returns text language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype; existing_processed timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  if not p_signature_verified then raise exception 'Provider signature or server verification required'; end if;
  insert into public.payment_events(provider,provider_event_id,event_type,signature_verified,payload)
  values('paystack',p_provider_event_id,p_event_type,true,coalesce(p_payload,'{}'::jsonb))
  on conflict(provider,provider_event_id) do nothing;
  select processed_at into existing_processed from public.payment_events where provider='paystack' and provider_event_id=p_provider_event_id for update;
  if existing_processed is not null then return 'already_processed'; end if;
  select * into target from public.orders where reference=p_reference for update;
  if not found then
    update public.payment_events set error_message='Order reference not found',processed_at=now() where provider='paystack' and provider_event_id=p_provider_event_id;
    return 'order_not_found';
  end if;
  if target.total_minor<>p_amount_minor or target.currency<>upper(p_currency) then
    update public.payment_events set error_message='Amount or currency mismatch',processed_at=now() where provider='paystack' and provider_event_id=p_provider_event_id;
    insert into public.audit_events(action,target_type,target_id,metadata) values('payment.verification_mismatch','order',target.id,jsonb_build_object('expected_amount',target.total_minor,'received_amount',p_amount_minor,'expected_currency',target.currency,'received_currency',upper(p_currency)));
    return 'amount_mismatch';
  end if;
  insert into public.payment_attempts(order_id,provider,provider_reference,amount_minor,currency,status,provider_response)
  values(target.id,'paystack',p_reference,p_amount_minor,upper(p_currency),case when p_status='success' then 'success' else case when p_status in ('failed','abandoned','reversed') then p_status else 'pending' end end,coalesce(p_payload,'{}'::jsonb))
  on conflict(provider_reference) do update set status=excluded.status,provider_response=excluded.provider_response,updated_at=now();
  if p_status='success' then
    update public.orders set status='paid',updated_at=now() where id=target.id and status in ('pending_payment','paid');
    if target.status<>'fulfilled' then perform public.fulfill_registration_order(target.id,'paystack_verified'); end if;
  elsif p_status in ('failed','abandoned') then
    update public.orders set status='expired',updated_at=now() where id=target.id and status='pending_payment';
    update public.registration_requests set status='cancelled',updated_at=now() where order_id=target.id and status='pending_payment';
  elsif p_status='reversed' then
    update public.orders set status='refunded',updated_at=now() where id=target.id;
    update public.entitlements set status='revoked',revoked_at=now() where order_id=target.id and status='active';
    update public.event_memberships set status='cancelled',updated_at=now() where order_id=target.id;
  end if;
  update public.payment_events set processed_at=now(),error_message=null where provider='paystack' and provider_event_id=p_provider_event_id;
  insert into public.audit_events(action,target_type,target_id,metadata) values('payment.paystack_'||p_status,'order',target.id,jsonb_build_object('provider_event_id',p_provider_event_id,'amount_minor',p_amount_minor,'currency',upper(p_currency)));
  return case when p_status='success' then 'fulfilled' else p_status end;
exception when others then
  update public.payment_events set error_message=sqlerrm where provider='paystack' and provider_event_id=p_provider_event_id;
  raise;
end; $$;

revoke all on function public.record_payment_initialization(uuid,text,text,jsonb) from public;
grant execute on function public.record_payment_initialization(uuid,text,text,jsonb) to authenticated;
revoke all on function public.process_paystack_payment(text,text,text,text,bigint,text,jsonb,boolean) from public;
grant execute on function public.process_paystack_payment(text,text,text,text,bigint,text,jsonb,boolean) to service_role;
comment on function public.process_paystack_payment is 'Service-only idempotent Paystack verification processor; exact amount and currency match precedes fulfillment.';
