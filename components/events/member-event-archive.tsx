"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type MemberEventArchiveAccess = {
  archive_highlights: string[] | null;
  archive_summary: string | null;
  archive_title: string | null;
  available: boolean;
  community_id: string | null;
  is_event_host: boolean;
  review_note: string | null;
  status: string | null;
};

export type EventMediaSubmission = {
  alt_text: string;
  caption: string | null;
  captured_at: string | null;
  created_at: string;
  credit: string | null;
  image_url: string | null;
  review_note: string | null;
  status: string;
  storage_path: string;
  submission_id: string;
};

export type LedCommunity = {
  community_id: string;
  name: string;
  slug: string;
};

const archiveStatus: Record<string, string> = {
  approved: "Published",
  changes_requested: "Update requested",
  declined: "Not published",
  draft: "Private draft",
  submitted: "Awaiting review",
  under_review: "Being reviewed",
};

export function MemberEventArchive({
  access,
  communities,
  eventId,
  eventTitle,
  media,
  userId,
}: {
  access: MemberEventArchiveAccess;
  communities: LedCommunity[];
  eventId: string;
  eventTitle: string;
  media: EventMediaSubmission[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [showStory, setShowStory] = useState(access.status === "changes_requested");
  const [showPhoto, setShowPhoto] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [consent, setConsent] = useState(false);

  async function saveStory(formElement: HTMLFormElement, submit: boolean) {
    const form = new FormData(formElement);
    setBusy("story");
    setMessage("");
    const highlights = String(form.get("highlights") ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
    const { error } = await supabase.rpc("save_member_event_archive", {
      p_community_id: String(form.get("community_id") ?? "") || null,
      p_event_id: eventId,
      p_highlights: highlights,
      p_submit: submit,
      p_summary: String(form.get("summary") ?? ""),
      p_title: String(form.get("title") ?? ""),
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, submit ? "send your event story for review" : "save your event story")
        : submit
          ? "Your event story is with the review team."
          : "Private event story saved.",
    );
    if (!error) {
      setShowStory(false);
      router.refresh();
    }
  }

  async function submitPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo || altText.trim().length < 5 || !consent) {
      setMessage("Choose a photo, describe it and confirm you may share it.");
      return;
    }
    if (photo.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
      setMessage("Choose a JPEG, PNG or WebP image smaller than 10 MB.");
      return;
    }
    setBusy("photo");
    setMessage("");
    const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const storagePath = `${eventId}/${userId}/member-submissions/${crypto.randomUUID()}.${extension}`;
    const uploaded = await supabase.storage.from("event-media").upload(storagePath, photo, {
      cacheControl: "3600",
      contentType: photo.type,
      upsert: false,
    });
    if (uploaded.error) {
      setBusy("");
      setMessage(memberErrorMessage(uploaded.error, "upload this event photo"));
      return;
    }
    const { error } = await supabase.rpc("submit_event_media", {
      p_alt_text: altText.trim(),
      p_caption: caption.trim() || null,
      p_captured_at: null,
      p_confirm_consent: consent,
      p_credit: credit.trim() || null,
      p_event_id: eventId,
      p_mime_type: photo.type,
      p_storage_path: storagePath,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "send this event photo for review")
        : "Photo sent privately for review.",
    );
    if (!error) {
      setPhoto(null);
      setAltText("");
      setCaption("");
      setCredit("");
      setConsent(false);
      setShowPhoto(false);
      router.refresh();
    }
  }

  async function withdraw(item: EventMediaSubmission) {
    setBusy(item.submission_id);
    setMessage("");
    const { error } = await supabase.rpc("withdraw_event_media_submission", {
      p_submission_id: item.submission_id,
    });
    if (!error) await supabase.storage.from("event-media").remove([item.storage_path]);
    setBusy("");
    setMessage(error ? memberErrorMessage(error, "withdraw this event photo") : "Photo withdrawn.");
    if (!error) router.refresh();
  }

  const storyEditable = !access.status || ["draft", "changes_requested"].includes(access.status);

  return (
    <section className="member-event-archive" aria-labelledby="member-event-archive-title">
      <header>
        <div>
          <p className="eyebrow">The event has ended</p>
          <h2 id="member-event-archive-title">Help preserve the story.</h2>
          <p>{access.is_event_host ? "Prepare the official recap and selected images. Everything stays private until the review team approves it." : "You may submit a reflection through Feedback or offer selected photos for the reviewed event gallery."}</p>
        </div>
        <div>
          {access.is_event_host && storyEditable ? <button className="button button-primary" onClick={() => setShowStory((current) => !current)} type="button">{showStory ? "Close story" : access.status ? "Continue event story" : "Write the event story"}</button> : null}
          <button className="button button-outline" onClick={() => setShowPhoto((current) => !current)} type="button">{showPhoto ? "Close photo form" : "Offer a photo"}</button>
        </div>
      </header>

      {access.is_event_host && access.status ? (
        <div className="member-event-archive-state">
          <span>{archiveStatus[access.status] ?? access.status.replaceAll("_", " ")}</span>
          <strong>{access.archive_title}</strong>
          {access.review_note ? <p><b>Review guidance:</b> {access.review_note}</p> : null}
        </div>
      ) : null}

      {showStory && access.is_event_host && storyEditable ? (
        <form className="member-event-story-form" onSubmit={(event) => { event.preventDefault(); void saveStory(event.currentTarget, true); }}>
          <label>Recap title<input defaultValue={access.archive_title ?? `${eventTitle}: the story`} maxLength={140} minLength={4} name="title" required /></label>
          <label>What happened and why did it matter?<textarea defaultValue={access.archive_summary ?? ""} maxLength={4000} minLength={40} name="summary" placeholder="Share the purpose, the room, the most useful moments and what should continue." required rows={7}/></label>
          <label>Key moments <small>One per line, up to 12</small><textarea defaultValue={access.archive_highlights?.join("\n") ?? ""} name="highlights" placeholder="A useful conversation began…\nMembers agreed to…" rows={5}/></label>
          <label>Community to continue in <small>Optional</small><select defaultValue={access.community_id ?? ""} name="community_id"><option value="">No approved Community yet</option>{communities.map((community) => <option key={community.community_id} value={community.community_id}>{community.name}</option>)}</select></label>
          <p className="member-event-archive-guidance">A Community link appears only after both the event story and the Community are approved. Attendees still choose whether to join.</p>
          <footer><button className="button button-outline" disabled={busy === "story"} onClick={(event) => event.currentTarget.form && void saveStory(event.currentTarget.form, false)} type="button">Save private draft</button><button className="button button-primary" disabled={busy === "story"}>{busy === "story" ? "Sending…" : "Send story for review"}</button></footer>
        </form>
      ) : null}

      {showPhoto ? (
        <form className="member-event-photo-form" onSubmit={submitPhoto}>
          <div><p className="eyebrow">Private submission</p><h3>Offer one photo</h3><p>The image is visible only to you and the review team until it is approved.</p></div>
          <label>Choose photo<input accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} required type="file"/></label>
          <label>Describe what is visible<input maxLength={300} minLength={5} onChange={(event) => setAltText(event.target.value)} placeholder="Three members speaking around a breakfast table" required value={altText}/></label>
          <label>Caption <small>Optional</small><textarea maxLength={600} onChange={(event) => setCaption(event.target.value)} rows={3} value={caption}/></label>
          <label>Photo credit <small>Optional</small><input maxLength={160} onChange={(event) => setCredit(event.target.value)} placeholder="Photographer or member name" value={credit}/></label>
          <label className="member-event-photo-consent"><input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox"/><span>I took this image or have permission to share it, and the people shown agreed to this event use.</span></label>
          <button className="button button-primary" disabled={busy === "photo"}>{busy === "photo" ? "Uploading…" : "Send photo for review"}</button>
        </form>
      ) : null}

      {media.length ? <div className="member-event-media-list">{media.map((item) => <article key={item.submission_id}>{item.image_url ? <img alt={item.alt_text} src={item.image_url}/> : <span aria-hidden="true">Image</span>}<div><small>{item.status === "approved" ? "Published" : item.status === "rejected" ? "Not approved" : item.status === "withdrawn" ? "Withdrawn" : "Awaiting review"}</small><strong>{item.caption || item.alt_text}</strong>{item.review_note ? <p>{item.review_note}</p> : null}</div>{["submitted", "rejected"].includes(item.status) ? <button disabled={busy === item.submission_id} onClick={() => void withdraw(item)} type="button">Withdraw</button> : null}</article>)}</div> : null}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </section>
  );
}
