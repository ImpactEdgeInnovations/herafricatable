"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";

export type MemberEventArchiveAdmin = {
  archive_highlights: string[];
  archive_summary: string;
  archive_title: string;
  community_id: string | null;
  community_name: string | null;
  community_slug: string | null;
  event_id: string;
  event_slug: string;
  event_title: string;
  proposed_by: string;
  proposer_email: string;
  proposer_name: string | null;
  review_note: string | null;
  status: string;
  submitted_at: string | null;
  updated_at: string;
};

export type EventMediaSubmissionAdmin = {
  alt_text: string;
  caption: string | null;
  captured_at: string | null;
  created_at: string;
  credit: string | null;
  event_id: string;
  event_slug: string;
  event_title: string;
  image_url: string | null;
  is_event_host: boolean;
  review_note: string | null;
  status: string;
  storage_path: string;
  submission_id: string;
  submitted_by: string;
  submitter_email: string;
  submitter_name: string | null;
};

export function MemberEventArchiveManager({
  archives,
  media,
  migrationReady,
}: {
  archives: MemberEventArchiveAdmin[];
  media: EventMediaSubmissionAdmin[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const openArchives = archives.filter((item) => ["submitted", "under_review"].includes(item.status));
  const openMedia = media.filter((item) => item.status === "submitted");

  async function reviewArchive(item: MemberEventArchiveAdmin, action: "approve" | "decline" | "request_changes" | "start_review") {
    let note = "";
    if (action !== "start_review") {
      const result = await ask({
        confirmLabel: action === "approve" ? "Publish event story" : action === "request_changes" ? "Send guidance" : "Decline story",
        description: action === "approve" ? `This publishes the Host's recap${item.community_name ? ` and links ${item.community_name}` : ""}. No attendee is added to a Community.` : "The Host will see this note on the event page.",
        fields: [{ label: action === "approve" ? "Approval note" : "Guidance for the Host", maxLength: 1200, minLength: action === "approve" ? undefined : 10, name: "note", required: action !== "approve", type: "textarea" }],
        title: action === "approve" ? `Publish ${item.archive_title}?` : action === "request_changes" ? "Request an update?" : "Decline this story?",
        tone: action === "decline" ? "danger" : "default",
      });
      if (!result) return;
      note = String(result.note ?? "");
    }
    setBusy(`archive-${item.event_id}`);
    setMessage("");
    const { error } = await supabase.rpc("review_member_event_archive", {
      p_action: action,
      p_event_id: item.event_id,
      p_review_note: note || null,
    });
    setBusy("");
    setMessage(error ? adminErrorMessage(error, "review this event story") : action === "approve" ? "Event story published." : action === "request_changes" ? "Guidance sent to the Host." : action === "decline" ? "Event story declined." : "Event story marked as in review.");
    if (!error) router.refresh();
  }

  async function reviewMedia(item: EventMediaSubmissionAdmin, action: "approve" | "reject") {
    let note = "";
    if (action === "reject") {
      const result = await ask({
        confirmLabel: "Do not publish",
        description: "The member will see your guidance and may withdraw the private submission.",
        fields: [{ label: "Reason", maxLength: 1200, minLength: 10, name: "note", required: true, type: "textarea" }],
        title: "Do not publish this image?",
        tone: "danger",
      });
      if (!result) return;
      note = String(result.note ?? "");
    } else {
      const confirmed = await ask({
        confirmLabel: "Publish image",
        description: "This places the image and its approved caption in the public event gallery. Confirm consent and suitable context before continuing.",
        title: "Publish this event image?",
      });
      if (!confirmed) return;
    }
    setBusy(`media-${item.submission_id}`);
    setMessage("");
    const { error } = await supabase.rpc("review_event_media_submission", {
      p_action: action,
      p_review_note: note || null,
      p_submission_id: item.submission_id,
    });
    setBusy("");
    setMessage(error ? adminErrorMessage(error, "review this event image") : action === "approve" ? "Image published in the event gallery." : "Image kept private and guidance sent.");
    if (!error) router.refresh();
  }

  return (
    <section className="admin-section member-event-archive-review" id="member-event-archives" aria-labelledby="member-event-archives-title">
      <div className="admin-section-heading"><div><p className="eyebrow">Past event stories</p><h2 id="member-event-archives-title">Review recaps and photos</h2><p>Hosts prepare the official story. Confirmed guests may offer photos, but nothing becomes public until it is reviewed here.</p></div><span className="status-count">{openArchives.length + openMedia.length} need review</span></div>
      {!migrationReady ? <div className="admin-empty"><strong>Past event submissions need their database update</strong><p>Existing published recaps and galleries remain available.</p></div> : <>
        <div className="member-event-archive-admin-grid">
          <section><header><h3>Host event stories</h3><span>{openArchives.length}</span></header>{openArchives.length ? openArchives.map((item) => <article key={item.event_id}><span>{item.status === "under_review" ? "In review" : "New story"}</span><h4>{item.archive_title}</h4><p>{item.event_title} · {item.proposer_name || item.proposer_email}</p><blockquote>{item.archive_summary}</blockquote>{item.archive_highlights?.length ? <ul>{item.archive_highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}{item.community_name ? <p className="archive-community-link">Proposed continuation: <strong>{item.community_name}</strong></p> : null}<footer>{item.status === "submitted" ? <button className="button button-outline" disabled={busy === `archive-${item.event_id}`} onClick={() => void reviewArchive(item, "start_review")} type="button">Begin review</button> : null}<button className="button button-primary" disabled={busy === `archive-${item.event_id}`} onClick={() => void reviewArchive(item, "approve")} type="button">Publish story</button><button className="button button-outline" disabled={busy === `archive-${item.event_id}`} onClick={() => void reviewArchive(item, "request_changes")} type="button">Request changes</button><button className="button button-outline danger-action" disabled={busy === `archive-${item.event_id}`} onClick={() => void reviewArchive(item, "decline")} type="button">Decline</button><Link className="button button-outline" href={`/events/${item.event_slug}`}>View event</Link></footer></article>) : <div className="admin-empty admin-empty-compact"><strong>No event stories need review</strong><p>New Host submissions will appear here.</p></div>}</section>
          <section><header><h3>Member photo offers</h3><span>{openMedia.length}</span></header>{openMedia.length ? <div className="member-event-media-admin-list">{openMedia.map((item) => <article key={item.submission_id}>{item.image_url ? <img alt={item.alt_text} src={item.image_url}/> : <div className="media-preview-missing">Preview unavailable</div>}<div><span>{item.is_event_host ? "Event Host" : "Confirmed guest"}</span><h4>{item.caption || item.alt_text}</h4><p>{item.event_title} · {item.submitter_name || item.submitter_email}</p>{item.credit ? <small>Credit: {item.credit}</small> : null}</div><footer><button className="button button-primary" disabled={busy === `media-${item.submission_id}`} onClick={() => void reviewMedia(item, "approve")} type="button">Publish photo</button><button className="button button-outline danger-action" disabled={busy === `media-${item.submission_id}`} onClick={() => void reviewMedia(item, "reject")} type="button">Do not publish</button></footer></article>)}</div> : <div className="admin-empty admin-empty-compact"><strong>No photos need review</strong><p>Consent-confirmed Host and guest submissions will appear here.</p></div>}</section>
        </div>
      </>}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
      {dialog}
    </section>
  );
}
