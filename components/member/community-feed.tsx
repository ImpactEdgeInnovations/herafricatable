"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";

const conversationTypes = [
  { label: "Discussion", value: "discussion" },
  { label: "Introduction", value: "introduction" },
  { label: "Ask", value: "ask" },
  { label: "Offer", value: "offer" },
  { label: "Opportunity", value: "opportunity" },
  { label: "Resource", value: "resource" },
  { label: "Event follow-up", value: "event_follow_up" },
  { label: "Win or outcome", value: "win" },
] as const;

const hostConversationTypes = [
  { label: "Start here", value: "start_here" },
  { label: "Announcement", value: "announcement" },
] as const;

const categoryLabels = new Map<string, string>([
  ...conversationTypes.map((item) => [item.value, item.label] as const),
  ["start_here", "Start here"],
  ["announcement", "Announcement"],
]);

export type CommunityPost = {
  appreciation_count?: number;
  appreciated_by_me?: boolean;
  author_company: string | null;
  author_id: string;
  author_name: string;
  author_role: string | null;
  body: string;
  category?: string;
  comment_count?: number;
  created_at: string;
  followed_by_me?: boolean;
  is_pinned?: boolean;
  post_id: string;
  saved_by_me?: boolean;
};

export type CommunityComment = {
  author_company: string | null;
  author_id: string;
  author_name: string;
  author_role: string | null;
  body: string;
  comment_id: string;
  created_at: string;
  post_id: string;
};

export function CommunityFeed({
  canManage,
  communityId,
  currentUserId,
  enhanced,
  initialComments,
  initialPosts,
  readOnly = false,
  prompt,
}: {
  canManage: boolean;
  communityId: string;
  currentUserId: string;
  enhanced: boolean;
  initialComments: CommunityComment[];
  initialPosts: CommunityPost[];
  readOnly?: boolean;
  prompt?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const { ask, dialog } = useActionDialog();
  const availableTypes = canManage
    ? [...hostConversationTypes, ...conversationTypes]
    : [...conversationTypes];
  const posts =
    filter === "all"
      ? initialPosts
      : initialPosts.filter((post) => post.category === filter);
  const commentsByPost = useMemo(() => {
    const grouped = new Map<string, CommunityComment[]>();
    initialComments.forEach((comment) => {
      grouped.set(comment.post_id, [
        ...(grouped.get(comment.post_id) ?? []),
        comment,
      ]);
    });
    return grouped;
  }, [initialComments]);

  function announce(error: unknown, action: string, success: string) {
    setMessage(error ? memberErrorMessage(error, action) : success);
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("body") || "");
    const category = String(form.get("category") || "discussion");
    setBusy("publish");
    const { error } = enhanced
      ? await supabase.rpc("create_structured_community_post", {
          p_body: body,
          p_category: category,
          p_community_id: communityId,
        })
      : await supabase.rpc("create_community_post", {
          p_body: body,
          p_community_id: communityId,
        });
    setBusy("");
    announce(
      error,
      "publish your community post",
      "Your conversation is live in this community.",
    );
    if (!error) {
      formElement.reset();
      router.refresh();
    }
  }

  async function comment(
    event: FormEvent<HTMLFormElement>,
    postId: string,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const body = String(new FormData(formElement).get("body") || "");
    setBusy(`comment-${postId}`);
    const { error } = await supabase.rpc("create_community_comment", {
      p_body: body,
      p_post_id: postId,
    });
    setBusy("");
    announce(error, "add your comment", "Your comment has been added.");
    if (!error) {
      formElement.reset();
      router.refresh();
    }
  }

  async function setPostState(
    post: CommunityPost,
    action: "appreciation" | "followed" | "saved",
  ) {
    const current =
      action === "appreciation"
        ? Boolean(post.appreciated_by_me)
        : action === "saved"
          ? Boolean(post.saved_by_me)
          : Boolean(post.followed_by_me);
    const operation =
      action === "appreciation"
        ? "set_community_post_appreciation"
        : action === "saved"
          ? "set_community_post_saved"
          : "set_community_post_followed";
    setBusy(`${action}-${post.post_id}`);
    const { error } = await supabase.rpc(operation, {
      p_active: !current,
      p_post_id: post.post_id,
    });
    setBusy("");
    announce(
      error,
      `update this ${action === "appreciation" ? "appreciation" : action === "saved" ? "saved post" : "followed conversation"}`,
      action === "appreciation"
        ? current
          ? "Appreciation removed."
          : "Appreciation shared."
        : action === "saved"
          ? current
            ? "Removed from your private reading list."
            : "Saved to your private reading list."
          : current
            ? "Thread notifications turned off."
            : "You will be notified about new replies.",
    );
    if (!error) router.refresh();
  }

  async function pin(post: CommunityPost) {
    setBusy(`pin-${post.post_id}`);
    const { error } = await supabase.rpc("set_community_post_pinned", {
      p_pinned: !post.is_pinned,
      p_post_id: post.post_id,
    });
    setBusy("");
    announce(
      error,
      "change this pinned conversation",
      post.is_pinned ? "Conversation unpinned." : "Conversation pinned.",
    );
    if (!error) router.refresh();
  }

  async function remove(id: string, kind: "comment" | "post") {
    const result = await ask({
      title: `Remove this ${kind}?`,
      description: `This ${kind} will no longer be visible in the community. Its audit record remains available for safety operations.`,
      confirmLabel: `Remove ${kind}`,
      tone: "danger",
    });
    if (!result) return;
    setBusy(`remove-${id}`);
    const { error } = await supabase.rpc("delete_community_post", {
      p_post_id: id,
    });
    setBusy("");
    announce(error, `remove this ${kind}`, `${kind === "post" ? "Post" : "Comment"} removed.`);
    if (!error) router.refresh();
  }

  async function report(id: string, kind: "comment" | "post") {
    const result = await ask({
      title: `Report this ${kind} privately`,
      description:
        "Choose the concern and add enough context for the moderation team to review it safely.",
      confirmLabel: "Submit report",
      tone: "danger",
      fields: [
        {
          name: "category",
          label: "Reason",
          type: "select",
          initialValue: "safety",
          options: [
            { value: "harassment", label: "Harassment" },
            { value: "privacy", label: "Privacy" },
            { value: "spam", label: "Spam" },
            { value: "misinformation", label: "Misinformation" },
            { value: "safety", label: "Safety" },
            { value: "other", label: "Other" },
          ],
        },
        {
          name: "details",
          label: "What happened?",
          type: "textarea",
          required: true,
          minLength: 10,
          maxLength: 2000,
        },
      ],
    });
    if (!result) return;
    setBusy(`report-${id}`);
    const { error } = await supabase.rpc("report_community_post", {
      p_category: String(result.category),
      p_details: String(result.details),
      p_post_id: id,
    });
    setBusy("");
    announce(
      error,
      `send this ${kind} report`,
      "Report sent privately to the moderation team.",
    );
  }

  return (
    <section
      aria-labelledby="community-conversations-title"
      className="community-conversation-shell"
      id="conversations"
    >
      {dialog}
      <header className="community-conversation-heading">
        <div>
          <p className="eyebrow">Conversations</p>
          <h2 id="community-conversations-title">Exchange something useful.</h2>
        </div>
        <p>
          Be specific, protect private context and move one another forward.
        </p>
      </header>

      {readOnly ? null : (
        <form
          className="community-composer"
          onSubmit={(event) => void publish(event)}
        >
          <div className="community-composer-heading">
            <label htmlFor="community-post">
              {prompt ?? "Share with this community"}
            </label>
            {enhanced ? (
              <label>
                Conversation type
                <select name="category" defaultValue="discussion">
                  {availableTypes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <textarea
            id="community-post"
            name="body"
            minLength={2}
            maxLength={3000}
            required
            placeholder={
              prompt
                ? "Make one focused ask, offer a useful resource, or share a commitment from the table…"
                : "Offer a thoughtful update, question or resource…"
            }
          />
          <div>
            <small>
              Visible only to active members of this room. Keep confidential
              details in mutual private conversations.
            </small>
            <button
              className="button button-primary"
              disabled={busy === "publish"}
            >
              {busy === "publish" ? "Publishing…" : "Publish"}
            </button>
          </div>
        </form>
      )}

      {enhanced ? (
        <div className="community-conversation-filters" aria-label="Filter conversations">
          <button
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          {availableTypes.map((item) => (
            <button
              aria-pressed={filter === item.value}
              key={item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <section className="community-feed">
        {posts.length ? (
          posts.map((post) => {
            const comments = commentsByPost.get(post.post_id) ?? [];
            return (
              <article
                className={post.is_pinned ? "is-pinned" : ""}
                key={post.post_id}
              >
                <header>
                  <div>
                    <span className="community-post-category">
                      {post.is_pinned ? "Pinned · " : ""}
                      {categoryLabels.get(post.category ?? "discussion") ??
                        "Discussion"}
                    </span>
                    <strong>{post.author_name}</strong>
                    <small>
                      {[post.author_role, post.author_company]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  <time>
                    {new Intl.DateTimeFormat("en-KE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(post.created_at))}
                  </time>
                </header>
                <p>{post.body}</p>

                {enhanced ? (
                  <div className="community-post-actions">
                    <button
                      aria-pressed={Boolean(post.appreciated_by_me)}
                      disabled={busy === `appreciation-${post.post_id}`}
                      onClick={() =>
                        void setPostState(post, "appreciation")
                      }
                    >
                      Appreciate
                      {Number(post.appreciation_count)
                        ? ` · ${post.appreciation_count}`
                        : ""}
                    </button>
                    <button
                      aria-pressed={Boolean(post.saved_by_me)}
                      disabled={busy === `saved-${post.post_id}`}
                      onClick={() => void setPostState(post, "saved")}
                    >
                      {post.saved_by_me ? "Saved" : "Save privately"}
                    </button>
                    <button
                      aria-pressed={Boolean(post.followed_by_me)}
                      disabled={busy === `followed-${post.post_id}`}
                      onClick={() => void setPostState(post, "followed")}
                    >
                      {post.followed_by_me ? "Following" : "Follow replies"}
                    </button>
                    {canManage ? (
                      <button
                        aria-pressed={Boolean(post.is_pinned)}
                        disabled={busy === `pin-${post.post_id}`}
                        onClick={() => void pin(post)}
                      >
                        {post.is_pinned ? "Unpin" : "Pin for members"}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {enhanced ? (
                  <details className="community-comment-thread">
                    <summary>
                      {comments.length || Number(post.comment_count)
                        ? `${comments.length || post.comment_count} comment${
                            Number(comments.length || post.comment_count) === 1
                              ? ""
                              : "s"
                          }`
                        : "Add the first comment"}
                    </summary>
                    {comments.length ? (
                      <div className="community-comments">
                        {comments.map((commentItem) => (
                          <article key={commentItem.comment_id}>
                            <header>
                              <div>
                                <strong>{commentItem.author_name}</strong>
                                <small>
                                  {[
                                    commentItem.author_role,
                                    commentItem.author_company,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </small>
                              </div>
                              <time>
                                {new Intl.DateTimeFormat("en-KE", {
                                  dateStyle: "medium",
                                }).format(new Date(commentItem.created_at))}
                              </time>
                            </header>
                            <p>{commentItem.body}</p>
                            <footer>
                              {commentItem.author_id === currentUserId ? (
                                <button
                                  disabled={
                                    busy ===
                                    `remove-${commentItem.comment_id}`
                                  }
                                  onClick={() =>
                                    void remove(
                                      commentItem.comment_id,
                                      "comment",
                                    )
                                  }
                                >
                                  Remove
                                </button>
                              ) : (
                                <button
                                  disabled={
                                    busy ===
                                    `report-${commentItem.comment_id}`
                                  }
                                  onClick={() =>
                                    void report(
                                      commentItem.comment_id,
                                      "comment",
                                    )
                                  }
                                >
                                  Report privately
                                </button>
                              )}
                            </footer>
                          </article>
                        ))}
                      </div>
                    ) : null}
                    {readOnly ? null : (
                      <form
                        className="community-comment-form"
                        onSubmit={(event) =>
                          void comment(event, post.post_id)
                        }
                      >
                        <label htmlFor={`comment-${post.post_id}`}>
                          Add useful context
                        </label>
                        <textarea
                          id={`comment-${post.post_id}`}
                          maxLength={1500}
                          minLength={2}
                          name="body"
                          placeholder="Respond thoughtfully…"
                          required
                        />
                        <button
                          disabled={busy === `comment-${post.post_id}`}
                        >
                          {busy === `comment-${post.post_id}`
                            ? "Adding…"
                            : "Add comment"}
                        </button>
                      </form>
                    )}
                  </details>
                ) : null}

                <footer>
                  <details className="community-post-more">
                    <summary>More options</summary>
                    {post.author_id === currentUserId ? (
                      <button
                        disabled={busy === `remove-${post.post_id}`}
                        onClick={() => void remove(post.post_id, "post")}
                      >
                        Remove post
                      </button>
                    ) : (
                      <button
                        disabled={busy === `report-${post.post_id}`}
                        onClick={() => void report(post.post_id, "post")}
                      >
                        Report privately
                      </button>
                    )}
                  </details>
                </footer>
              </article>
            );
          })
        ) : (
          <div className="admin-empty">
            <strong>
              {filter === "all"
                ? "Begin the conversation"
                : `No ${categoryLabels.get(filter)?.toLowerCase()} posts yet`}
            </strong>
            <p>
              Share one focused thought, request, opportunity or resource that
              another member can act on.
            </p>
          </div>
        )}
      </section>
      {message ? (
        <p className="network-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
