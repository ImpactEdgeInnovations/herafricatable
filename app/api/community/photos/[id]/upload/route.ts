import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepareCommunityPhoto } from "@/lib/community-photo-processing.mjs";
import { memberErrorMessage } from "@/lib/member-error";
import { communityPhotoRequestLimit, readCommunityPhotoBody } from "@/lib/community-photo-body.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maximum = communityPhotoRequestLimit; // One photo per request, below the hosting body limit.

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Please upload from your Community page." }, { status: 403 });
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "Choose a photo upload." }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > maximum) return NextResponse.json({ error: "Choose a photo smaller than 4 MB." }, { status: 413 });
  let token: string | undefined;
  let path: string | undefined;
  const admin = createAdminClient();
  try {
    const caption = decodeURIComponent(request.headers.get("x-photo-caption") ?? "");
    if (caption.length > 500 || !request.body) throw new Error("Add a caption of up to 500 characters and choose a photo.");
    const binary = await readCommunityPhotoBody(request.body);
    const { data: claim, error: claimError } = await admin.rpc("claim_community_photo_upload", { p_photo_id: id, p_actor: user.id });
    if (claimError) throw claimError;
    if (claim?.status === "published" || claim?.status === "pending") return NextResponse.json({ status: claim.status });
    if (typeof claim?.token !== "string" || typeof claim?.path !== "string") throw new Error("Start a new photo upload.");
    token = claim.token;
    path = claim.path;
    const processed = await prepareCommunityPhoto(binary);
    for (const [name, binary] of [["original", processed.original], ["thumbnail", processed.thumbnail]] as const) {
      const { error } = await admin.storage.from("community-photos").upload(`${path}/${name}.webp`, binary, { contentType: "image/webp", upsert: false, cacheControl: "0" });
      if (error) throw error;
    }
    const { data: status, error } = await admin.rpc("finish_community_photo_upload", { p_photo_id: id, p_actor: user.id, p_token: token,
      p_bytes: processed.storedBytes, p_width: processed.width, p_height: processed.height, p_caption: caption });
    if (error) throw error;
    return NextResponse.json({ status });
  } catch (error) {
    if (token && path) {
      // A timed-out finalisation may actually have committed. Never delete a
      // saved photo merely because its response was lost.
      const { data: current, error: lookupError } = await admin.from("community_album_photos").select("status,upload_token,uploader_id").eq("id", id).maybeSingle();
      if (!lookupError && current?.uploader_id === user.id && ["published", "pending"].includes(current.status)) {
        return NextResponse.json({ status: current.status });
      }
      if (!lookupError && current?.status === "uploading" && current.upload_token === token) {
        const { error: removeError } = await admin.storage.from("community-photos").remove([`${path}/original.webp`, `${path}/thumbnail.webp`]);
        if (!removeError) await admin.rpc("reset_community_photo_upload", { p_photo_id: id, p_token: token });
      }
    }
    return NextResponse.json({ error: memberErrorMessage(error, "save this photo") }, { status: 400 });
  }
}
