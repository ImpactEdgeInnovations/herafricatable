begin;
-- Text-only online gatherings do not have an external meeting URL.
-- Hybrid gatherings still require one; supplied URLs retain existing HTTPS validation.
alter table public.community_event_proposals drop constraint if exists community_event_proposal_online;
alter table public.community_event_proposals add constraint community_event_proposal_online
  check (format <> 'hybrid' or nullif(trim(coalesce(online_url, '')), '') is not null);
commit;
