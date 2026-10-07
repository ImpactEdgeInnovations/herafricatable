"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";
import { useCommunityFileGuard } from "@/lib/use-community-file-guard";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";

export type CommunityBrandIdentity = {
  community_id: string;
  tagline: string | null;
  accent_key: "wine" | "gold" | "forest" | "ocean" | "terracotta";
  icon_asset_id: string | null;
  icon_storage_path: string | null;
  icon_alt_text: string | null;
  icon_width: number | null;
  icon_height: number | null;
  icon_url?: string | null;
  cover_asset_id: string | null;
  cover_storage_path: string | null;
  cover_alt_text: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_url?: string | null;
};

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const accents = [
  { label: "Wine", value: "wine" },
  { label: "Gold", value: "gold" },
  { label: "Forest", value: "forest" },
  { label: "Ocean", value: "ocean" },
  { label: "Terracotta", value: "terracotta" },
] as const;

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function inspectImage(file: File) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(source);
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new Error("The selected image could not be read."));
    };
    image.src = source;
  });
}

export function CommunityBrandingPanel({
  communityId,
  currentUserId,
  identity,
  migrationReady,
  owner,
}: {
  communityId: string;
  currentUserId: string;
  identity: CommunityBrandIdentity | null;
  migrationReady: boolean;
  owner: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [cover, setCover] = useState<File | null>(null);
  const [icon, setIcon] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const initialDraft = { tagline: identity?.tagline ?? "", accent: identity?.accent_key ?? "wine", iconAlt: "", coverAlt: "", removeIcon: false, removeCover: false };
  const [draft, setDraft, clearDraft] = useCommunityDraft(communityDraftKey(currentUserId, "branding", communityId), initialDraft);
  const [savedDraft, setSavedDraft] = useState(initialDraft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const { ask, dialog } = useActionDialog();
  useCommunityFileGuard(owner && migrationReady && Boolean(icon || cover), {
    ask,
    busy,
    discard: () => { setIcon(null); setCover(null); clearFileInputs(); },
    blocked: () => setMessage("Please wait for your images to finish saving."),
  });
  function clearFileInputs() {
    formRef.current?.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(input => { input.value = ""; });
  }

  if (!owner) return null;

  if (!migrationReady) {
    return (
      <section className="community-branding-panel" id="identity">
        <div className="community-host-unavailable" role="status">
          <strong>Look and feel controls are not ready yet.</strong>
          <p>
            Nothing has changed. Logo and cover image controls will appear here
            when setup is complete.
          </p>
        </div>
      </section>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner || busy || (!dirty && !icon && !cover)) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submitted = { ...draft };
    setBusy(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again before saving.");

      let iconUpload:
        | {
            height: number;
            path: string;
            width: number;
          }
        | undefined;
      let coverUpload:
        | {
            height: number;
            path: string;
            width: number;
          }
        | undefined;

      if (icon) {
        if (!imageTypes.includes(icon.type) || icon.size > 3 * 1024 * 1024) {
          throw new Error("Choose a JPG, PNG or WebP icon up to 3 MB.");
        }
        const dimensions = await inspectImage(icon);
        const ratio = dimensions.width / dimensions.height;
        if (
          dimensions.width < 256 ||
          dimensions.height < 256 ||
          ratio < 0.75 ||
          ratio > 1.34
        ) {
          throw new Error(
            "The icon must be at least 256 × 256 px and approximately square.",
          );
        }
        const path = `${communityId}/branding/${user.id}/icon-${crypto.randomUUID()}.${extensionFor(icon)}`;
        const upload = await supabase.storage
          .from("community-media")
          .upload(path, icon, {
            cacheControl: "31536000",
            contentType: icon.type,
            upsert: false,
          });
        if (upload.error) throw upload.error;
        iconUpload = { ...dimensions, path };
      }

      if (cover) {
        if (!imageTypes.includes(cover.type) || cover.size > 8 * 1024 * 1024) {
          throw new Error("Choose a JPG, PNG or WebP cover up to 8 MB.");
        }
        const dimensions = await inspectImage(cover);
        const ratio = dimensions.width / dimensions.height;
        if (
          dimensions.width < 1200 ||
          dimensions.height < 400 ||
          ratio < 2 ||
          ratio > 4.5
        ) {
          throw new Error(
            "The cover must be at least 1200 × 400 px with a wide landscape shape.",
          );
        }
        const path = `${communityId}/branding/${user.id}/cover-${crypto.randomUUID()}.${extensionFor(cover)}`;
        const upload = await supabase.storage
          .from("community-media")
          .upload(path, cover, {
            cacheControl: "31536000",
            contentType: cover.type,
            upsert: false,
          });
        if (upload.error) throw upload.error;
        coverUpload = { ...dimensions, path };
      }

      const { error } = await supabase.rpc("save_community_brand_identity", {
        p_accent_key: String(form.get("accent_key") ?? "wine"),
        p_community_id: communityId,
        p_cover_alt_text: cover
          ? String(form.get("cover_alt_text") ?? "")
          : null,
        p_cover_height: coverUpload?.height ?? null,
        p_cover_mime_type: cover?.type ?? null,
        p_cover_original_name: cover?.name ?? null,
        p_cover_size_bytes: cover?.size ?? null,
        p_cover_storage_path: coverUpload?.path ?? null,
        p_cover_width: coverUpload?.width ?? null,
        p_icon_alt_text: icon
          ? String(form.get("icon_alt_text") ?? "")
          : null,
        p_icon_height: iconUpload?.height ?? null,
        p_icon_mime_type: icon?.type ?? null,
        p_icon_original_name: icon?.name ?? null,
        p_icon_size_bytes: icon?.size ?? null,
        p_icon_storage_path: iconUpload?.path ?? null,
        p_icon_width: iconUpload?.width ?? null,
        p_remove_cover: form.get("remove_cover") === "on",
        p_remove_icon: form.get("remove_icon") === "on",
        p_tagline: String(form.get("tagline") ?? ""),
      });
      if (error) throw error;

      setCover(null);
      setIcon(null);
      const saved = { ...submitted, iconAlt: "", coverAlt: "", removeIcon: false, removeCover: false };
      setSavedDraft(saved); clearDraft(saved);
      clearFileInputs();
      setMessage(
        "Community images and colour saved.",
      );
      router.refresh();
    } catch (error) {
      setMessage(memberErrorMessage(error, "save this community identity"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="community-branding-panel" id="identity">
      {dialog}
      <header>
        <div>
          <p className="eyebrow">Look &amp; feel</p>
          <h2>Make the community recognisable.</h2>
        </div>
        <p>
          Add a simple identity that still feels like Her Africa Table. Images
          stay private while you prepare the community.
        </p>
      </header>

      <div
        className={`community-brand-preview accent-${identity?.accent_key ?? "wine"}`}
      >
        {identity?.cover_url ? (
          <img
            alt={identity.cover_alt_text ?? ""}
            className="community-brand-cover"
            height={identity.cover_height ?? undefined}
            src={identity.cover_url}
            width={identity.cover_width ?? undefined}
          />
        ) : (
          <div className="community-brand-cover is-placeholder" aria-hidden="true" />
        )}
        <div>
          {identity?.icon_url ? (
            <img
              alt={identity.icon_alt_text ?? ""}
              className="community-brand-icon"
              height={identity.icon_height ?? undefined}
              src={identity.icon_url}
              width={identity.icon_width ?? undefined}
            />
          ) : (
            <span className="community-brand-icon is-placeholder" aria-hidden="true">
              H
            </span>
          )}
          <div>
            <span>Saved look</span>
            <strong>{identity?.tagline ?? "A purposeful community for members."}</strong>
          </div>
        </div>
      </div>

      <form ref={formRef} className="community-branding-form" onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy} className="span-two" style={{ display: "contents" }}>
        <label className="span-two">
          Community tagline
          <input
            value={draft.tagline}
            onChange={event => setDraft(current => ({ ...current, tagline: event.target.value }))}
            maxLength={140}
            minLength={3}
            name="tagline"
            placeholder="A clear promise in one short sentence"
          />
          <small>Optional · shown beneath the community name.</small>
        </label>

        <fieldset className="span-two community-accent-picker">
          <legend>Accent colour</legend>
          <div>
            {accents.map((accent) => (
              <label key={accent.value}>
                <input
                  checked={draft.accent === accent.value}
                  onChange={() => setDraft(current => ({ ...current, accent: accent.value }))}
                  name="accent_key"
                  type="radio"
                  value={accent.value}
                />
                <span className={`accent-swatch accent-${accent.value}`} />
                {accent.label}
              </label>
            ))}
          </div>
          <small>
            The accent appears in small details only; typography and layout stay
            consistent across the platform.
          </small>
        </fieldset>

        <div className="community-branding-upload">
          <label>
            Community logo
            <input
              accept="image/jpeg,image/png,image/webp"
              name="icon"
              onChange={(event) => setIcon(event.target.files?.[0] ?? null)}
              type="file"
            />
            <small>JPG, PNG or WebP · 256 × 256 px minimum · 3 MB maximum.</small>
          </label>
          <label>
            Icon description
            <input
              disabled={!icon}
              value={draft.iconAlt}
              onChange={event => setDraft(current => ({ ...current, iconAlt: event.target.value }))}
              maxLength={240}
              minLength={3}
              name="icon_alt_text"
              placeholder="Describe the symbol or text in the icon"
              required={Boolean(icon)}
            />
          </label>
          {identity?.icon_asset_id ? (
            <label className="community-brand-remove">
              <input name="remove_icon" type="checkbox" checked={draft.removeIcon} onChange={event => setDraft(current => ({ ...current, removeIcon: event.target.checked }))} />
              Remove the current icon
            </label>
          ) : null}
        </div>

        <div className="community-branding-upload">
          <label>
            Cover image
            <input
              accept="image/jpeg,image/png,image/webp"
              name="cover"
              onChange={(event) => setCover(event.target.files?.[0] ?? null)}
              type="file"
            />
            <small>JPG, PNG or WebP · 1200 × 400 px minimum · 8 MB maximum.</small>
          </label>
          <label>
            Cover description
            <input
              disabled={!cover}
              value={draft.coverAlt}
              onChange={event => setDraft(current => ({ ...current, coverAlt: event.target.value }))}
              maxLength={240}
              minLength={3}
              name="cover_alt_text"
              placeholder="Describe the people, setting or artwork"
              required={Boolean(cover)}
            />
          </label>
          {identity?.cover_asset_id ? (
            <label className="community-brand-remove">
              <input name="remove_cover" type="checkbox" checked={draft.removeCover} onChange={event => setDraft(current => ({ ...current, removeCover: event.target.checked }))} />
              Remove the current cover
            </label>
          ) : null}
        </div>

        <footer className="span-two">
          <div>
            <strong>Save your changes</strong>
            <small>
              This does not change who can see or join your Community.
            </small>
          </div>
          <button className="button button-primary" disabled={busy || (!dirty && !icon && !cover)}>
            {busy ? "Saving…" : "Save look and feel"}
          </button>
        </footer>
        </fieldset>
      </form>
      {dirty ? <p role="status">Changes are not saved yet. <button type="button" disabled={busy} onClick={() => clearDraft(savedDraft)}>Discard changes</button></p> : null}

      {message ? (
        <p className="community-host-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
