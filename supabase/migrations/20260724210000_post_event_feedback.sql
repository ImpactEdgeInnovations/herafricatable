begin;

create table public.event_recaps(
 event_id uuid primary key references public.events(id)on delete cascade,title text not null check(char_length(title)between 4 and 140),
 summary text not null check(char_length(summary)between 40 and 4000),highlights text[]not null default array[]::text[],
 status text not null default'draft'check(status in('draft','published','archived')),published_at timestamptz,
 updated_by uuid references auth.users(id)on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.event_feedback(
 id uuid primary key default gen_random_uuid(),event_id uuid not null,user_id uuid not null,
 overall_rating smallint not null check(overall_rating between 1 and 5),relevance_rating smallint not null check(relevance_rating between 1 and 5),
 connection_rating smallint not null check(connection_rating between 1 and 5),would_recommend boolean not null,
 highlight text check(highlight is null or char_length(highlight)<=2000),improvement text check(improvement is null or char_length(improvement)<=2000),
 testimonial_quote text check(testimonial_quote is null or char_length(testimonial_quote)<=1000),
 testimonial_consent text not null default'none'check(testimonial_consent in('none','anonymous','named')),
 testimonial_status text not null default'not_requested'check(testimonial_status in('not_requested','pending','approved','rejected','withdrawn')),
 consent_version text,submitted_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(event_id,user_id)references public.event_memberships(event_id,user_id)on delete cascade,unique(event_id,user_id),
 check((testimonial_consent='none'and testimonial_status in('not_requested','withdrawn'))or(testimonial_consent<>'none'and testimonial_quote is not null and testimonial_status in('pending','approved','rejected')))
);
create table public.event_feedback_followups(
 feedback_id uuid primary key references public.event_feedback(id)on delete cascade,status text not null default'open'check(status in('open','resolved')),
 owner_id uuid references auth.users(id)on delete set null,internal_note text check(internal_note is null or char_length(internal_note)<=2000),
 resolved_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index event_feedback_event_idx on public.event_feedback(event_id,submitted_at desc);
create index event_feedback_testimonial_idx on public.event_feedback(event_id,testimonial_status)where testimonial_status in('pending','approved');

alter table public.event_recaps enable row level security;alter table public.event_feedback enable row level security;alter table public.event_feedback_followups enable row level security;
create policy "Anyone reads published event recaps"on public.event_recaps for select to anon,authenticated using(status='published');
create policy "Event managers read scoped recaps"on public.event_recaps for select to authenticated using(public.can_manage_event(event_id));
create policy "Members read own event feedback"on public.event_feedback for select to authenticated using(user_id=auth.uid());
create policy "Event managers read scoped event feedback"on public.event_feedback for select to authenticated using(public.can_manage_event(event_id));
create policy "Event managers read scoped feedback followups"on public.event_feedback_followups for select to authenticated using(exists(select 1 from public.event_feedback f where f.id=feedback_id and public.can_manage_event(f.event_id)));

create or replace function public.list_public_past_events(p_limit integer default 24,p_offset integer default 0)
returns table(event_id uuid,slug text,title text,summary text,format text,starts_at timestamptz,ends_at timestamptz,timezone text,venue_name text,city text,country text,recap_title text,recap_summary text,highlights text[])
language sql stable security definer set search_path=''as $$
 select e.id,e.slug,e.title,e.summary,e.format,e.starts_at,e.ends_at,e.timezone,v.name,v.city,v.country,r.title,r.summary,r.highlights
 from public.events e left join public.venues v on v.id=e.venue_id left join public.event_recaps r on r.event_id=e.id and r.status='published'
 where e.status in('published','completed')and e.ends_at<now() order by e.starts_at desc limit least(greatest(coalesce(p_limit,24),1),50)offset greatest(coalesce(p_offset,0),0)
$$;

create or replace function public.list_my_past_events()
returns table(event_id uuid,slug text,title text,starts_at timestamptz,ends_at timestamptz,timezone text,membership_status text,feedback_id uuid,feedback_submitted_at timestamptz)
language plpgsql stable security definer set search_path=''as $$begin
 if auth.uid()is null then raise exception'Authentication required';end if;
 return query select e.id,e.slug,e.title,e.starts_at,e.ends_at,e.timezone,m.status,f.id,f.submitted_at from public.event_memberships m join public.events e on e.id=m.event_id left join public.event_feedback f on f.event_id=m.event_id and f.user_id=m.user_id where m.user_id=auth.uid()and m.status in('confirmed','attended')and e.ends_at<now()order by e.starts_at desc;
end;$$;

create or replace function public.save_event_feedback(p_event_id uuid,p_overall integer,p_relevance integer,p_connections integer,p_would_recommend boolean,p_highlight text,p_improvement text,p_testimonial_quote text,p_testimonial_consent text)
returns uuid language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();saved uuid;evt public.events%rowtype;consent text:=coalesce(p_testimonial_consent,'none');quote text:=nullif(trim(p_testimonial_quote),'');
begin
 if not public.is_active_member(actor)then raise exception'Active membership required';end if;
 select e.*into evt from public.events e join public.event_memberships m on m.event_id=e.id and m.user_id=actor where e.id=p_event_id and m.status in('confirmed','attended');
 if not found then raise exception'Confirmed event attendance required';end if;if evt.ends_at>=now()then raise exception'Feedback opens after the event ends';end if;
 if p_overall not between 1 and 5 or p_relevance not between 1 and 5 or p_connections not between 1 and 5 then raise exception'Ratings must be between 1 and 5';end if;
 if consent not in('none','anonymous','named')then raise exception'Unsupported testimonial consent';end if;
 if consent<>'none'and(quote is null or char_length(quote)<20)then raise exception'A testimonial quote of at least 20 characters is required';end if;
 insert into public.event_feedback(event_id,user_id,overall_rating,relevance_rating,connection_rating,would_recommend,highlight,improvement,testimonial_quote,testimonial_consent,testimonial_status,consent_version)
 values(p_event_id,actor,p_overall,p_relevance,p_connections,p_would_recommend,nullif(trim(p_highlight),''),nullif(trim(p_improvement),''),case when consent='none'then null else quote end,consent,case when consent='none'then'not_requested'else'pending'end,case when consent='none'then null else'2026-07-22'end)
 on conflict(event_id,user_id)do update set overall_rating=excluded.overall_rating,relevance_rating=excluded.relevance_rating,connection_rating=excluded.connection_rating,would_recommend=excluded.would_recommend,highlight=excluded.highlight,improvement=excluded.improvement,testimonial_quote=excluded.testimonial_quote,testimonial_consent=excluded.testimonial_consent,testimonial_status=case when excluded.testimonial_consent='none'then'not_requested'else'pending'end,consent_version=excluded.consent_version,updated_at=now()returning id into saved;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'event.feedback_saved','event_feedback',saved,jsonb_build_object('event_id',p_event_id,'testimonial_consent',consent));return saved;
end;$$;

create or replace function public.withdraw_event_testimonial(p_event_id uuid)
returns void language plpgsql security definer set search_path=''as $$declare target uuid;begin
 update public.event_feedback set testimonial_consent='none',testimonial_status='withdrawn',testimonial_quote=null,consent_version=null,updated_at=now()where event_id=p_event_id and user_id=auth.uid()and testimonial_consent<>'none'returning id into target;
 if target is null then raise exception'Active testimonial consent not found';end if;insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'event.testimonial_withdrawn','event_feedback',target,jsonb_build_object('event_id',p_event_id));
end;$$;

create or replace function public.save_event_recap(p_event_id uuid,p_title text,p_summary text,p_highlights text[],p_status text)
returns void language plpgsql security definer set search_path=''as $$
declare actor uuid:=auth.uid();clean_highlights text[];
begin if not public.can_manage_event(p_event_id)then raise exception'Not authorized';end if;if p_status not in('draft','published','archived')then raise exception'Unsupported recap status';end if;if char_length(trim(coalesce(p_title,'')))not between 4 and 140 or char_length(trim(coalesce(p_summary,'')))not between 40 and 4000 then raise exception'Recap title and a detailed summary are required';end if;
 select coalesce(array_agg(v order by ord),array[]::text[])into clean_highlights from(select trim(value)v,ord from unnest(coalesce(p_highlights,array[]::text[]))with ordinality as h(value,ord)where char_length(trim(value))between 2 and 240 limit 12)x;
 insert into public.event_recaps(event_id,title,summary,highlights,status,published_at,updated_by)values(p_event_id,trim(p_title),trim(p_summary),clean_highlights,p_status,case when p_status='published'then now()end,actor)on conflict(event_id)do update set title=excluded.title,summary=excluded.summary,highlights=excluded.highlights,status=excluded.status,published_at=case when excluded.status='published'then coalesce(event_recaps.published_at,now())else event_recaps.published_at end,updated_by=actor,updated_at=now();
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'event.recap_saved','event',p_event_id,jsonb_build_object('status',p_status));end;$$;

create or replace function public.list_event_feedback_admin(p_event_id uuid)
returns table(feedback_id uuid,user_id uuid,member_name text,member_email text,overall_rating smallint,relevance_rating smallint,connection_rating smallint,would_recommend boolean,highlight text,improvement text,testimonial_quote text,testimonial_consent text,testimonial_status text,submitted_at timestamptz,followup_status text,followup_note text)
language plpgsql stable security definer set search_path=''as $$begin if not public.can_manage_event(p_event_id)then raise exception'Not authorized';end if;return query select f.id,f.user_id,p.display_name,u.email::text,f.overall_rating,f.relevance_rating,f.connection_rating,f.would_recommend,f.highlight,f.improvement,f.testimonial_quote,f.testimonial_consent,f.testimonial_status,f.submitted_at,fu.status,fu.internal_note from public.event_feedback f join auth.users u on u.id=f.user_id left join public.profiles p on p.id=f.user_id left join public.event_feedback_followups fu on fu.feedback_id=f.id where f.event_id=p_event_id order by f.submitted_at desc;end;$$;

create or replace function public.get_event_feedback_summary(p_event_id uuid)
returns table(response_count bigint,average_overall numeric,average_relevance numeric,average_connections numeric,recommendation_percent numeric,pending_testimonials bigint,open_followups bigint)
language plpgsql stable security definer set search_path=''as $$begin if not public.can_manage_event(p_event_id)then raise exception'Not authorized';end if;return query select count(f.id),round(avg(f.overall_rating),2),round(avg(f.relevance_rating),2),round(avg(f.connection_rating),2),round(100.0*count(*)filter(where f.would_recommend)/nullif(count(*),0),1),count(*)filter(where f.testimonial_status='pending'),(select count(*)from public.event_feedback_followups fu join public.event_feedback ff on ff.id=fu.feedback_id where ff.event_id=p_event_id and fu.status='open')from public.event_feedback f where f.event_id=p_event_id;end;$$;

create or replace function public.review_event_feedback(p_feedback_id uuid,p_action text,p_note text)
returns void language plpgsql security definer set search_path=''as $$declare actor uuid:=auth.uid();target public.event_feedback%rowtype;begin select*into target from public.event_feedback where id=p_feedback_id for update;if not found or not public.can_manage_event(target.event_id)then raise exception'Not authorized';end if;
 if p_action in('approve_testimonial','reject_testimonial')then if target.testimonial_status<>'pending'then raise exception'Pending testimonial not found';end if;update public.event_feedback set testimonial_status=case when p_action='approve_testimonial'then'approved'else'rejected'end,updated_at=now()where id=p_feedback_id;
 elsif p_action in('open_followup','resolve_followup')then if char_length(trim(coalesce(p_note,'')))<5 then raise exception'An internal follow-up note is required';end if;insert into public.event_feedback_followups(feedback_id,status,owner_id,internal_note,resolved_at)values(p_feedback_id,case when p_action='open_followup'then'open'else'resolved'end,actor,trim(p_note),case when p_action='resolve_followup'then now()end)on conflict(feedback_id)do update set status=excluded.status,owner_id=actor,internal_note=excluded.internal_note,resolved_at=excluded.resolved_at,updated_at=now();
 else raise exception'Unsupported feedback action';end if;
 insert into public.audit_events(actor_id,action,target_type,target_id,metadata)values(actor,'event.feedback_'||p_action,'event_feedback',p_feedback_id,jsonb_build_object('event_id',target.event_id));end;$$;

create or replace function public.list_event_testimonials(p_event_id uuid)
returns table(quote text,attribution text)language sql stable security definer set search_path=''as $$select f.testimonial_quote,case when f.testimonial_consent='named'then coalesce(p.display_name,'Member')else'Her Africa Table member'end from public.event_feedback f join public.events e on e.id=f.event_id left join public.profiles p on p.id=f.user_id where f.event_id=p_event_id and e.status in('published','completed')and e.ends_at<now()and f.testimonial_status='approved'and f.testimonial_consent in('anonymous','named')and f.testimonial_quote is not null order by f.submitted_at desc limit 12$$;

revoke all on function public.list_public_past_events(integer,integer)from public;grant execute on function public.list_public_past_events(integer,integer)to anon,authenticated;
revoke all on function public.list_my_past_events()from public;grant execute on function public.list_my_past_events()to authenticated;
revoke all on function public.save_event_feedback(uuid,integer,integer,integer,boolean,text,text,text,text)from public;grant execute on function public.save_event_feedback(uuid,integer,integer,integer,boolean,text,text,text,text)to authenticated;
revoke all on function public.withdraw_event_testimonial(uuid)from public;grant execute on function public.withdraw_event_testimonial(uuid)to authenticated;
revoke all on function public.save_event_recap(uuid,text,text,text[],text)from public;grant execute on function public.save_event_recap(uuid,text,text,text[],text)to authenticated;
revoke all on function public.list_event_feedback_admin(uuid)from public;grant execute on function public.list_event_feedback_admin(uuid)to authenticated;
revoke all on function public.get_event_feedback_summary(uuid)from public;grant execute on function public.get_event_feedback_summary(uuid)to authenticated;
revoke all on function public.review_event_feedback(uuid,text,text)from public;grant execute on function public.review_event_feedback(uuid,text,text)to authenticated;
revoke all on function public.list_event_testimonials(uuid)from public;grant execute on function public.list_event_testimonials(uuid)to anon,authenticated;

comment on table public.event_feedback is'Private post-event feedback with explicit, versioned testimonial reuse consent.';
comment on function public.list_public_past_events is'Public-safe past event and published recap projection.';
commit;
