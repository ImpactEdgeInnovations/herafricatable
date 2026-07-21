"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function MenuFeedbackControls({ itemId, initialRating, initialFavorite, initialComment }: { itemId: string; initialRating: number | null; initialFavorite: boolean; initialComment: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [rating, setRating] = useState(initialRating ?? 0);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [comment, setComment] = useState(initialComment ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    const { error } = await supabase.rpc("save_menu_feedback", { p_comment: comment, p_is_favorite: favorite, p_item_id: itemId, p_rating: rating || null });
    setSaving(false);
    setMessage(error ? error.message : comment.trim() ? "Saved. Your comment is awaiting review." : "Your table notes are saved.");
  }

  return <form className="menu-feedback-controls" onSubmit={save}>
    <div className="menu-feedback-row"><fieldset><legend>Your rating</legend>{[1, 2, 3, 4, 5].map((value) => <button type="button" aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={rating === value} className={value <= rating ? "selected" : ""} onClick={() => setRating(value)} key={value}>★</button>)}</fieldset><label><input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} /> Save as a favourite</label></div>
    <label className="menu-comment-field">Private until reviewed<textarea rows={2} maxLength={800} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Share a note about this dish…" /></label>
    <div className="menu-feedback-action"><button type="submit" disabled={saving || (!rating && !favorite && !comment.trim())}>{saving ? "Saving…" : "Save table notes"}</button>{message ? <span role="status">{message}</span> : null}</div>
  </form>;
}
