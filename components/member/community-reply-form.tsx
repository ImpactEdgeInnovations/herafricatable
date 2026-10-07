"use client";
import type { FormEvent } from "react";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";

export function CommunityReplyForm({ accountId, postId, busy, onSubmit }: {
  accountId: string; postId: string; busy: boolean; onSubmit(event: FormEvent<HTMLFormElement>): Promise<boolean>;
}) {
  const [body, setBody, clear] = useCommunityDraft(communityDraftKey(accountId, "community-post-reply", postId), "");
  return <form className="community-comment-form" onSubmit={async event => {
    event.preventDefault(); if (await onSubmit(event)) clear("");
  }}>
    <label htmlFor={`comment-${postId}`}>Your reply</label>
    <textarea id={`comment-${postId}`} name="body" maxLength={1500} minLength={2} value={body} onChange={event => setBody(event.target.value)} placeholder="Ask a question or share your thoughts…" required />
    <button disabled={busy}>{busy ? "Adding…" : "Add reply"}</button>
  </form>;
}
