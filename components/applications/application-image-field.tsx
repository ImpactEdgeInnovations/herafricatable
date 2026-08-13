"use client";

import { useEffect, useState } from "react";
import {
  applicationMediaStatus,
  type ApplicationProposalMedia,
} from "@/lib/application-proposal-media";

export function ApplicationImageField({
  altText,
  existing,
  file,
  label,
  onAltText,
  onFile,
  onRemoveExisting,
  removing = false,
}: {
  altText: string;
  existing: ApplicationProposalMedia | null;
  file: File | null;
  label: string;
  onAltText: (value: string) => void;
  onFile: (value: File | null) => void;
  onRemoveExisting?: () => void;
  removing?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(existing?.image_url ?? null);

  useEffect(() => {
    if (!file) {
      setPreview(existing?.image_url ?? null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [existing?.image_url, file]);

  return (
    <section className="application-image-field" aria-label={label}>
      <div>
        <span>Optional image</span>
        <h5>{label}</h5>
        <p>A good image helps the review team understand the feeling of your idea. It is checked separately and is never published automatically.</p>
      </div>
      <div className="application-image-field-layout">
        <div className="application-image-preview">
          {preview ? <img alt={altText || existing?.alt_text || "Selected application image"} src={preview} /> : <span aria-hidden="true">Add an image</span>}
        </div>
        <div className="application-image-controls">
          {existing && !file ? <small className={`media-state state-${existing.status}`}>{applicationMediaStatus(existing.status)}</small> : null}
          {existing?.review_note && !file ? <p className="application-image-note"><strong>Review note</strong>{existing.review_note}</p> : null}
          <label>
            {existing ? "Replace image" : "Choose image"}
            <input
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <small>JPG, PNG or WebP · up to 6 MB · at least 400 × 240 pixels</small>
          </label>
          {existing && existing.status !== "approved" && onRemoveExisting ? (
            <button className="application-image-remove" disabled={removing} onClick={onRemoveExisting} type="button">
              {removing ? "Removing…" : "Remove image"}
            </button>
          ) : null}
          {(file || existing) ? (
            <label>
              Describe the image for members who cannot see it
              <input
                maxLength={240}
                minLength={10}
                onChange={(event) => onAltText(event.target.value)}
                placeholder="For example: Six women talking around a sunlit table"
                required={Boolean(file)}
                value={altText}
              />
              <small>{altText.trim().length}/240 characters</small>
            </label>
          ) : null}
        </div>
      </div>
    </section>
  );
}
