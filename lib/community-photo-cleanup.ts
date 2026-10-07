import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function cleanCommunityPhotos(uploaderId?: string) {
  const admin = createAdminClient();
  let removed = 0;
  let failed = 0;
  try {
  const { data, error } = await admin.rpc("claim_community_photo_cleanup", { p_uploader_id: uploaderId ?? null });
  if (error || !Array.isArray(data)) throw new Error("Photo cleanup could not start.");
  for (const item of data as { id: string; path: string }[]) {
    const { error: storageError } = await admin.storage.from("community-photos").remove([`${item.path}/original.webp`, `${item.path}/thumbnail.webp`]);
    if (storageError) { failed++; continue; }
    const { error: finishError } = await admin.rpc("finish_community_photo_cleanup", { p_photo_id: item.id });
    if (finishError) failed++; else removed++;
  }
  } catch { failed = Math.max(failed, 1); }
  // Only full scheduled runs update global health; per-account cleanup is not
  // evidence that the global queue has been checked.
  if (!uploaderId) {
    const { error } = await admin.rpc("record_community_photo_cleanup_health", { p_removed: removed, p_failed: failed });
    if (error) failed = Math.max(failed, 1);
  }
  return { removed, failed };
}
