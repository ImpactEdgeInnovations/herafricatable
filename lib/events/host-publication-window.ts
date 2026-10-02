export const HOST_DRAFT_PUBLICATION_LEAD_MS = 48 * 60 * 60 * 1000;

export function hostDraftPublicationCutoff(startsAt: string): Date {
  return new Date(Date.parse(startsAt) - HOST_DRAFT_PUBLICATION_LEAD_MS);
}

export function hostDraftPublicationWindowOpen(startsAt: string, now = Date.now()): boolean {
  const start = Date.parse(startsAt);
  return Number.isFinite(start) && start > now + HOST_DRAFT_PUBLICATION_LEAD_MS;
}
