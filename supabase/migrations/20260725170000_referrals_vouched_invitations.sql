begin;

insert into public.feature_flags(key,enabled,description)values('referrals',false,'Vouched member invitations and referral campaigns')on conflict(key)do nothing;

create table public.referral_campaigns(
 id uuid primary key default gen_random_uuid(),name text not null check(char_length(name)between 3 and 100),slug text not null unique check(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$'),
 description text not null check(char_length(description)between 20 and 1000),status text not null default'draft'check(status in('draft','active','paused','ended')),
 starts_at timestamptz,ends_at timestamptz,max_referrals_per_member integer not null default 5 check(max_referrals_per_member between 1 and 50),max_total_referrals integer check(max_total_referrals is null or max_total_referrals between 1 and 100000),
 created_by uuid not null references auth.users(id)on delete restrict,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),constraint referral_campaign_window check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create table public.referral_codes(
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.referral_campaigns(id)on delete cascade,referrer_id uuid not null references auth.users(id)on delete cascade,
 code text not null unique check(code~'^[A-Z0-9]{10}$'),status text not null default'active'check(status in('active','paused','revoked')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(campaign_id,referrer_id)
);
create table public.referral_invitations(
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.referral_campaigns(id)on delete restrict,referral_code_id uuid not null references public.referral_codes(id)on delete restrict,
 referrer_id uuid not null references auth.users(id)on delete restrict,invitee_email text not null,relationship text not null check(char_length(relationship)between 3 and 120),
 vouch text not null check(char_length(vouch)between 20 and 1200),status text not null default'pending_review'check(status in('pending_review','approved','rejected','claimed','activated','expired','revoked')),
 beta_invite_id uuid references public.beta_invites(id)on delete set null,referred_user_id uuid references auth.users(id)on delete set null,reviewed_by uuid references auth.users(id)on delete set null,review_note text,
 reviewed_at timestamptz,claimed_at timestamptz,activated_at timestamptz,expires_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint referral_email_normalized check(invitee_email=lower(trim(invitee_email)))
);
create unique index referral_invitation_one_open_email_idx on public.referral_invitations(lower(invitee_email))where status in('pending_review','approved');
create index referral_campaign_status_idx on public.referral_campaigns(status,starts_at,ends_at);
create index referral_invitations_referrer_idx on public.referral_invitations(referrer_id,created_at desc);
create index referral_invitations_admin_idx on public.referral_invitations(status,created_at);
create index referral_invitations_user_idx on public.referral_invitations(referred_user_id)where referred_user_id is not null;

alter table public.referral_campaigns enable row level security;alter table public.referral_codes enable row level security;alter table public.referral_invitations enable row level security;
create policy "Members read active referral campaigns"on public.referral_campaigns for select to authenticated using((public.is_active_member(auth.uid())and status in('active','paused'))or public.is_admin(array['super_admin']::public.app_role[]));
create policy "Members read own referral codes"on public.referral_codes for select to authenticated using(referrer_id=auth.uid()or public.is_admin(array['super_admin']::public.app_role[]));
create policy "Members read own referral invitations"on public.referral_invitations for select to authenticated using(referrer_id=auth.uid()or public.is_admin(array['super_admin']::public.app_role[]));

create or replace function public.referrals_enabled()returns boolean language sql stable security definer set search_path=''as $$select coalesce((select enabled from public.feature_flags where key='referrals'),false)$$;

create or replace function public.save_referral_campaign(p_campaign_id uuid,p_name text,p_slug text,p_description text,p_status text,p_starts_at timestamptz,p_ends_at timestamptz,p_member_limit integer,p_total_limit integer)
returns uuid language plpgsql security definer set search_path=''as $$declare saved uuid:=p_campaign_id;begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;if p_status not in('draft','active','paused','ended')then raise exception'Unsupported campaign status';end if;if p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at then raise exception'Campaign end must follow start';end if;
 if p_campaign_id is null then insert into public.referral_campaigns(name,slug,description,status,starts_at,ends_at,max_referrals_per_member,max_total_referrals,created_by)values(trim(p_name),lower(trim(p_slug)),trim(p_description),p_status,p_starts_at,p_ends_at,p_member_limit,p_total_limit,auth.uid())returning id into saved;
 else update public.referral_campaigns set name=trim(p_name),slug=lower(trim(p_slug)),description=trim(p_description),status=p_status,starts_at=p_starts_at,ends_at=p_ends_at,max_referrals_per_member=p_member_limit,max_total_referrals=p_total_limit,updated_at=now()where id=p_campaign_id;if not found then raise exception'Campaign not found';end if;end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),case when p_campaign_id is null then'referral.campaign_created'else'referral.campaign_updated'end,'referral_campaign',saved,jsonb_build_object('status',p_status));return saved;
end;$$;

create or replace function public.ensure_referral_code(p_campaign_id uuid)
returns text language plpgsql security definer set search_path=''as $$declare saved text;candidate text;campaign public.referral_campaigns%rowtype;begin
 if not public.referrals_enabled()or not public.is_active_member(auth.uid())then raise exception'Referrals are unavailable';end if;select*into campaign from public.referral_campaigns where id=p_campaign_id and status='active'and(starts_at is null or starts_at<=now())and(ends_at is null or ends_at>now());if not found then raise exception'Campaign is not active';end if;
 select code into saved from public.referral_codes where campaign_id=p_campaign_id and referrer_id=auth.uid()and status='active';if saved is not null then return saved;end if;
 loop candidate:=upper(substr(encode(gen_random_bytes(8),'hex'),1,10));begin insert into public.referral_codes(campaign_id,referrer_id,code)values(p_campaign_id,auth.uid(),candidate)returning code into saved;exit;exception when unique_violation then end;end loop;return saved;
end;$$;

create or replace function public.create_vouched_referral(p_campaign_id uuid,p_email text,p_relationship text,p_vouch text)
returns uuid language plpgsql security definer set search_path=''as $$declare campaign public.referral_campaigns%rowtype;code_id uuid;saved uuid;email_value text:=lower(trim(p_email));begin
 if not public.referrals_enabled()or not public.is_active_member(auth.uid())then raise exception'Referrals are unavailable';end if;select*into campaign from public.referral_campaigns where id=p_campaign_id and status='active'and(starts_at is null or starts_at<=now())and(ends_at is null or ends_at>now())for share;if not found then raise exception'Campaign is not active';end if;
 if email_value!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'then raise exception'Valid invitee email required';end if;if exists(select 1 from auth.users where lower(email)=email_value)then raise exception'This email already has an account';end if;
 if char_length(trim(coalesce(p_relationship,'')))not between 3 and 120 or char_length(trim(coalesce(p_vouch,'')))not between 20 and 1200 then raise exception'Relationship and a meaningful vouch are required';end if;
 if(select count(*)from public.referral_invitations where campaign_id=p_campaign_id and referrer_id=auth.uid()and status not in('rejected','expired','revoked'))>=campaign.max_referrals_per_member then raise exception'Member referral limit reached';end if;
 if campaign.max_total_referrals is not null and(select count(*)from public.referral_invitations where campaign_id=p_campaign_id and status not in('rejected','expired','revoked'))>=campaign.max_total_referrals then raise exception'Campaign referral limit reached';end if;
 perform public.ensure_referral_code(p_campaign_id);select id into code_id from public.referral_codes where campaign_id=p_campaign_id and referrer_id=auth.uid()and status='active';
 insert into public.referral_invitations(campaign_id,referral_code_id,referrer_id,invitee_email,relationship,vouch)values(p_campaign_id,code_id,auth.uid(),email_value,trim(p_relationship),trim(p_vouch))returning id into saved;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'referral.submitted','referral_invitation',saved,jsonb_build_object('campaign_id',p_campaign_id));return saved;
exception when unique_violation then raise exception'This email already has an open invitation';end;$$;

create or replace function public.list_my_referrals()
returns table(referral_id uuid,campaign_id uuid,campaign_name text,code text,invitee_email text,relationship text,vouch text,status text,review_note text,created_at timestamptz,claimed_at timestamptz,activated_at timestamptz)
language plpgsql stable security definer set search_path=''as $$begin if not public.is_active_member(auth.uid())then raise exception'Active membership required';end if;return query select r.id,r.campaign_id,c.name,rc.code,r.invitee_email,r.relationship,r.vouch,r.status,case when r.status in('rejected','revoked')then r.review_note else null end,r.created_at,r.claimed_at,r.activated_at from public.referral_invitations r join public.referral_campaigns c on c.id=r.campaign_id join public.referral_codes rc on rc.id=r.referral_code_id where r.referrer_id=auth.uid()order by r.created_at desc;end;$$;

create or replace function public.list_referrals_admin()
returns table(referral_id uuid,campaign_id uuid,campaign_name text,referrer_id uuid,referrer_name text,referrer_email text,invitee_email text,relationship text,vouch text,status text,review_note text,created_at timestamptz,claimed_at timestamptz,activated_at timestamptz)
language plpgsql stable security definer set search_path=''as $$begin if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;return query select r.id,r.campaign_id,c.name,r.referrer_id,p.display_name,u.email::text,r.invitee_email,r.relationship,r.vouch,r.status,r.review_note,r.created_at,r.claimed_at,r.activated_at from public.referral_invitations r join public.referral_campaigns c on c.id=r.campaign_id join auth.users u on u.id=r.referrer_id left join public.profiles p on p.id=r.referrer_id order by case r.status when'pending_review'then 0 when'approved'then 1 when'claimed'then 2 else 3 end,r.created_at;end;$$;

create or replace function public.review_vouched_referral(p_referral_id uuid,p_action text,p_note text)
returns void language plpgsql security definer set search_path=''as $$declare target public.referral_invitations%rowtype;invite uuid;begin
 if not public.is_admin(array['super_admin']::public.app_role[])then raise exception'Super admin required';end if;if p_action not in('approve','reject','revoke')then raise exception'Unsupported referral action';end if;if p_action in('reject','revoke')and char_length(trim(coalesce(p_note,'')))<5 then raise exception'Review reason required';end if;
 select*into target from public.referral_invitations where id=p_referral_id for update;if not found or(p_action in('approve','reject')and target.status<>'pending_review')or(p_action='revoke'and target.status not in('approved','claimed'))then raise exception'Referral is not reviewable';end if;
 if p_action='approve'then
  insert into public.beta_invites(email,status,invited_by,expires_at)values(target.invitee_email,'pending',auth.uid(),now()+interval'30 days')returning id into invite;
  update public.referral_invitations set status='approved',beta_invite_id=invite,reviewed_by=auth.uid(),review_note=nullif(trim(p_note),''),reviewed_at=now(),expires_at=now()+interval'30 days',updated_at=now()where id=p_referral_id;
  insert into public.notification_jobs(user_id,template_key,to_email,payload,dedupe_key)values(target.referrer_id,'referral_invitation',target.invitee_email,jsonb_build_object('title','An invitation to Her Africa Table','body','A member has vouched for you to join Her Africa Table. Your invitation is valid for 30 days.','href','/sign-in?ref='||(select code from public.referral_codes where id=target.referral_code_id)),'referral-invite:'||p_referral_id)on conflict(user_id,channel,dedupe_key)do nothing;
 elsif p_action='reject'then update public.referral_invitations set status='rejected',reviewed_by=auth.uid(),review_note=trim(p_note),reviewed_at=now(),updated_at=now()where id=p_referral_id;
 else update public.beta_invites set status='revoked'where id=target.beta_invite_id and status='pending';update public.referral_invitations set status='revoked',reviewed_by=auth.uid(),review_note=trim(p_note),reviewed_at=now(),updated_at=now()where id=p_referral_id;end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'referral.'||p_action,'referral_invitation',p_referral_id,jsonb_build_object('campaign_id',target.campaign_id,'note',nullif(trim(p_note),'')));
end;$$;

create or replace function public.sync_referral_invite_status()returns trigger language plpgsql security definer set search_path=''as $$begin
 if new.status='accepted'and old.status is distinct from'accepted'then update public.referral_invitations set status='claimed',referred_user_id=new.accepted_by,claimed_at=coalesce(new.accepted_at,now()),updated_at=now()where beta_invite_id=new.id and status='approved';end if;return new;end;$$;
create trigger sync_referral_on_beta_invite after update of status on public.beta_invites for each row execute function public.sync_referral_invite_status();
create or replace function public.sync_referral_activation()returns trigger language plpgsql security definer set search_path=''as $$begin if new.access_status='active'and old.access_status is distinct from'active'then update public.referral_invitations set status='activated',activated_at=now(),updated_at=now()where referred_user_id=new.id and status='claimed';end if;return new;end;$$;
create trigger sync_referral_on_profile_activation after update of access_status on public.profiles for each row execute function public.sync_referral_activation();

revoke all on function public.referrals_enabled()from public;grant execute on function public.referrals_enabled()to authenticated;
revoke all on function public.save_referral_campaign(uuid,text,text,text,text,timestamptz,timestamptz,integer,integer)from public;grant execute on function public.save_referral_campaign(uuid,text,text,text,text,timestamptz,timestamptz,integer,integer)to authenticated;
revoke all on function public.ensure_referral_code(uuid)from public;grant execute on function public.ensure_referral_code(uuid)to authenticated;
revoke all on function public.create_vouched_referral(uuid,text,text,text)from public;grant execute on function public.create_vouched_referral(uuid,text,text,text)to authenticated;
revoke all on function public.list_my_referrals()from public;grant execute on function public.list_my_referrals()to authenticated;
revoke all on function public.list_referrals_admin()from public;grant execute on function public.list_referrals_admin()to authenticated;
revoke all on function public.review_vouched_referral(uuid,text,text)from public;grant execute on function public.review_vouched_referral(uuid,text,text)to authenticated;

comment on table public.referral_invitations is'Member vouches requiring Super Admin review before a beta invitation can grant onboarding eligibility.';
comment on function public.review_vouched_referral is'Approval creates the existing invite-gate record; referral submission alone never grants access.';
commit;
