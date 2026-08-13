"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { adminErrorMessage } from "@/lib/admin-error";
import {
  applicationMediaStatus,
  type ApplicationProposalMedia,
} from "@/lib/application-proposal-media";
import { createClient } from "@/lib/supabase/client";

export function ApplicationImageReview({ media, name }: { media: ApplicationProposalMedia | null; name: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function review(action: "approve" | "reject" | "request_changes") {
    if (!media) return;
    const needsNote = action !== "approve";
    const result = await ask({
      confirmLabel: action === "approve" ? "Approve image" : action === "request_changes" ? "Send guidance" : "Do not use image",
      description: action === "approve"
        ? "This approves only the image. The Community or Event proposal still needs its own decision."
        : "This image decision does not decline the proposal itself.",
      fields: needsNote ? [{
        label: "Clear note for the member",
        maxLength: 1000,
        minLength: 10,
        name: "note",
        required: true,
        type: "textarea",
      }] : [],
      title: action === "approve" ? `Approve the image for ${name}?` : action === "request_changes" ? `Ask for a different image?` : `Leave this image out?`,
      tone: action === "reject" ? "danger" : "default",
    });
    if (!result) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("review_application_proposal_media", {
      p_action: action,
      p_media_id: media.media_id,
      p_review_note: String(result.note ?? "") || null,
    });
    setBusy(false);
    setMessage(error ? adminErrorMessage(error, "review this image") : action === "approve" ? "Image approved." : action === "request_changes" ? "The member was asked to replace the image." : "The image will not be used.");
    if (!error) router.refresh();
  }

  if (!media) {
    return <div className="application-image-review is-empty"><strong>No image supplied</strong><p>An image is optional and should not hold up the proposal decision.</p></div>;
  }

  return (
    <section className="application-image-review">
      <div className="application-image-review-preview">
        {media.image_url ? <img alt={media.alt_text} src={media.image_url} /> : <span>Preview unavailable</span>}
      </div>
      <div>
        <span className={`media-state state-${media.status}`}>{applicationMediaStatus(media.status)}</span>
        <h4>Application image</h4>
        <p>{media.alt_text}</p>
        {media.review_note ? <blockquote><strong>Review note</strong>{media.review_note}</blockquote> : null}
        <div className="application-image-review-actions">{media.status !== "approved" ? <button className="button button-small button-primary" disabled={busy} onClick={() => void review("approve")} type="button">Approve image</button> : null}<button className="button button-small button-outline" disabled={busy} onClick={() => void review("request_changes")} type="button">Ask for another</button><button className="button button-small button-quiet" disabled={busy} onClick={() => void review("reject")} type="button">{media.status === "approved" ? "Stop using image" : "Do not use"}</button></div>
        {message ? <p className="manager-message" role="status">{message}</p> : null}
      </div>
      {dialog}
    </section>
  );
}
