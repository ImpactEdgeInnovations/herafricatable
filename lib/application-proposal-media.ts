import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplicationProposalMedia = {
  alt_text: string;
  context_id: string;
  context_type: "community_application" | "member_event_proposal";
  created_at: string;
  height: number;
  image_url: string | null;
  media_id: string;
  mime_type: string;
  owner_id: string;
  review_note: string | null;
  status: "approved" | "changes_requested" | "rejected" | "submitted";
  storage_path: string;
  updated_at: string;
  width: number;
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function imageSize(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const dimensions = await new Promise<{ height: number; width: number }>((resolve, reject) => {
      image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth });
      image.onerror = () => reject(new Error("We could not read that image. Please choose another one."));
      image.src = url;
    });
    return dimensions;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadApplicationProposalMedia(
  supabase: SupabaseClient,
  input: {
    altText: string;
    contextId: string;
    contextType: ApplicationProposalMedia["context_type"];
    file: File;
  },
) {
  if (!allowedTypes.has(input.file.type)) {
    throw new Error("Choose a JPG, PNG or WebP image.");
  }
  if (input.file.size > 6 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 6 MB.");
  }
  if (input.altText.trim().length < 10 || input.altText.trim().length > 240) {
    throw new Error("Describe the image in 10 to 240 characters.");
  }
  const { width, height } = await imageSize(input.file);
  if (width < 400 || width > 6000 || height < 240 || height > 6000) {
    throw new Error("Choose an image at least 400 × 240 pixels and no larger than 6000 pixels on either side.");
  }
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Please sign in again before uploading the image.");
  const path = `${input.contextType}/${input.contextId}/${authData.user.id}/${crypto.randomUUID()}.${extensionFor(input.file)}`;
  const uploaded = await supabase.storage.from("proposal-media").upload(path, input.file, {
    cacheControl: "3600",
    contentType: input.file.type,
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;
  const { error } = await supabase.rpc("save_application_proposal_media", {
    p_alt_text: input.altText.trim(),
    p_context_id: input.contextId,
    p_context_type: input.contextType,
    p_height: height,
    p_mime_type: input.file.type,
    p_storage_path: path,
    p_width: width,
  });
  if (error) {
    await supabase.storage.from("proposal-media").remove([path]);
    throw error;
  }
}

export async function removeApplicationProposalMedia(
  supabase: SupabaseClient,
  media: ApplicationProposalMedia,
) {
  const removed = await supabase.storage.from("proposal-media").remove([media.storage_path]);
  if (removed.error) throw removed.error;
  const { error } = await supabase.rpc("remove_application_proposal_media", {
    p_media_id: media.media_id,
  });
  if (error) throw error;
}

export function applicationMediaStatus(status: ApplicationProposalMedia["status"]) {
  return {
    approved: "Image approved",
    changes_requested: "Please replace this image",
    rejected: "Image will not be used",
    submitted: "Image awaiting review",
  }[status];
}
