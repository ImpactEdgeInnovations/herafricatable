"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationImageField } from "@/components/applications/application-image-field";
import { useActionDialog } from "@/components/ui/action-dialog";
import {
  removeApplicationProposalMedia,
  type ApplicationProposalMedia,
  uploadApplicationProposalMedia,
} from "@/lib/application-proposal-media";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";

export function ApplicationImageQuickEdit({
  contextId,
  contextType,
  existing,
  label,
  automatic = false,
}: {
  contextId: string;
  contextType: ApplicationProposalMedia["context_type"];
  existing: ApplicationProposalMedia | null;
  label: string;
  automatic?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [open, setOpen] = useState(existing?.status === "changes_requested");
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState(existing?.alt_text ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload() {
    if (!file) {
      setMessage("Choose an image first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const saved = await uploadApplicationProposalMedia(supabase, { altText, contextId, contextType, file });
      setFile(null);
      setOpen(false);
      setMessage(saved.status === "approved" ? "Poster saved and published on your event page." : automatic ? "Poster saved, but publication was not confirmed. The pilot may have been paused; refresh and check your event." : "Image saved for review.");
      router.refresh();
    } catch (error) {
      setMessage(memberErrorMessage(error, "add the image"));
    }
    setBusy(false);
  }

  async function remove() {
    if (!existing) return;
    const confirmed = await ask({
      confirmLabel: "Remove image",
      description: "Your written application remains unchanged.",
      title: `Remove the ${label.toLowerCase()}?`,
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await removeApplicationProposalMedia(supabase, existing);
      setAltText("");
      setOpen(false);
      setMessage("Image removed. Your application remains in place.");
      router.refresh();
    } catch (error) {
      setMessage(memberErrorMessage(error, "remove the image"));
    }
    setBusy(false);
  }

  return (
    <div className="application-image-quick-edit">
      <button aria-expanded={open} className="application-image-quick-toggle" onClick={() => setOpen((value) => !value)} type="button">
        {open ? "Close image options" : existing ? `Replace or remove ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
      </button>
      {open ? <><ApplicationImageField automatic={automatic} altText={altText} existing={existing} file={file} label={label} onAltText={setAltText} onFile={setFile} onRemoveExisting={() => void remove()} removing={busy} /><button className="button button-small button-primary" disabled={busy || !file || altText.trim().length < 10} onClick={() => void upload()} type="button">{busy ? "Uploading…" : automatic ? "Save poster" : "Send image for review"}</button>{file && altText.trim().length < 10 ? <p className="form-hint" role="status">Add a short image description (at least 10 characters) to save your poster.</p> : null}</> : null}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
      {dialog}
    </div>
  );
}
