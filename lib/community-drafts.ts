// Private, tab-memory-only drafts. Never write member text to device storage.
const drafts = new Map<string, { value: unknown; savedAt: number }>();
const lifetime = 8 * 60 * 60 * 1000;
const maximumEntries = 100;
let epoch = 0;
export function communityDraftKey(account: string, area: string, id: string) {
  return JSON.stringify([account, area, id]);
}
export function readCommunityDraft<T>(key: string, now = Date.now()): T | undefined {
  const saved = drafts.get(key);
  if (!saved) return undefined;
  if (now - saved.savedAt >= lifetime) { drafts.delete(key); return undefined; }
  return JSON.parse(JSON.stringify(saved.value)) as T;
}
export function writeCommunityDraft<T>(key: string, value: T, now = Date.now()) {
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 100000) return;
  drafts.delete(key);
  drafts.set(key, { value: JSON.parse(serialized), savedAt: now });
  while (drafts.size > maximumEntries) drafts.delete(drafts.keys().next().value!);
}
export function removeCommunityDraft(key: string) { drafts.delete(key); }
export function clearCommunityDrafts() { drafts.clear(); epoch += 1; }
export function communityDraftEpoch() { return epoch; }
