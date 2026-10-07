import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function cleanCommunityPhotos(uploaderId?: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_community_photo_cleanup", { p_uploader_id: uploaderId ?? null });
  if (error || !Array.isArray(data)) return { removed: 0, failed: 1 };
  let removed = 0;
  let failed = 0;
  for (const item of data as { id: string; path: string }[]) {
    const { error: storageError } = await admin.storage.from("community-photos").remove([`${item.path}/original.webp`, `${item.path}/thumbnail.webp`]);
    if (storageError) { failed++; continue; }
    const { error: finishError } = await admin.rpc("finish_community_photo_cleanup", { p_photo_id: item.id });
    if (finishError) failed++; else removed++;
  }
  return { removed, failed };
}
