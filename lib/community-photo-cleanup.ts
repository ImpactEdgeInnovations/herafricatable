import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function cleanCommunityPhotos(uploaderId?: string) {
  const admin = createAdminClient();
  let removed = 0;
  let failed = 0;
  try {
  const tombstones = await admin.rpc("claim_community_photo_deletions", { p_uploader_id: uploaderId ?? null });
  if (tombstones.error || !Array.isArray(tombstones.data)) {
    failed++;
  } else for (const item of tombstones.data as { id: string; path: string; token: string }[]) {
    try {
      const { error } = await admin.storage.from("community-photos").remove([`${item.path}/original.webp`, `${item.path}/thumbnail.webp`]);
      if (error) { failed++; continue; }
      const finish = await admin.rpc("finish_community_photo_deletion", { p_photo_id: item.id, p_claim_token: item.token });
      if (finish.error || finish.data !== true) failed++; else removed++;
    } catch { failed++; }
  }
  const { data, error } = await admin.rpc("claim_community_photo_cleanup", { p_uploader_id: uploaderId ?? null });
  if (error || !Array.isArray(data)) throw new Error("Photo cleanup could not start.");
  for (const item of data as { id: string; path: string }[]) {
    try {
    const { error: storageError } = await admin.storage.from("community-photos").remove([`${item.path}/original.webp`, `${item.path}/thumbnail.webp`]);
    if (storageError) { failed++; continue; }
    const { error: finishError } = await admin.rpc("finish_community_photo_cleanup", { p_photo_id: item.id });
    if (finishError) failed++; else removed++;
    } catch { failed++; }
  }
  } catch { failed = Math.max(failed, 1); }
  // Only full scheduled runs update global health; per-account cleanup is not
  // evidence that the global queue has been checked.
  if (!uploaderId) {
    try {
    const { error } = await admin.rpc("record_community_photo_cleanup_health", { p_removed: removed, p_failed: failed });
    if (error) failed = Math.max(failed, 1);
    } catch { failed = Math.max(failed, 1); }
  }
  return { removed, failed };
}
