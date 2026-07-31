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

const conversationTypeHints = new Map<string, string>([
  ["discussion", "Start a focused exchange that invites useful perspectives."],
  ["introduction", "Share enough context for the right members to find you."],
  ["ask", "Name the help, introduction or insight you need."],
  ["offer", "Offer a skill, introduction or resource another member can use."],
  ["opportunity", "Share a credible opportunity with a clear next step."],
  ["resource", "Add why this resource matters, not only the link."],
  ["event_follow_up", "Continue a useful thread from a gathering."],
  ["win", "Share the outcome and acknowledge the people who helped."],
  ["start_here", "Set the room context, boundaries and first useful action."],
  ["announcement", "Publish an important host update for every member."],
]);

type ConversationOrder = "active" | "newest";
type ConversationView = "all" | "following" | "mine" | "saved";

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
  const [category, setCategory] = useState("all");
  const [composerType, setComposerType] = useState("discussion");
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState<ConversationOrder>("newest");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ConversationView>("all");
  const { ask, dialog } = useActionDialog();
  const availableTypes = canManage
    ? [...hostConversationTypes, ...conversationTypes]
    : [...conversationTypes];
  const roomSnapshot = useMemo(
    () => ({
      asksAndOpportunities: initialPosts.filter((post) =>
        ["ask", "opportunity"].includes(post.category ?? ""),
      ).length,
      followed: initialPosts.filter((post) => post.followed_by_me).length,
      saved: initialPosts.filter((post) => post.saved_by_me).length,
    }),
    [initialPosts],
  );
  const posts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const filtered = initialPosts.filter((post) => {
      const matchesView =
        view === "all" ||
        (view === "following" && post.followed_by_me) ||
        (view === "saved" && post.saved_by_me) ||
        (view === "mine" && post.author_id === currentUserId);
      const matchesCategory =
        category === "all" || post.category === category;
      const searchable = [
        post.body,
        post.author_name,
        post.author_role,
        post.author_company,
        categoryLabels.get(post.category ?? "discussion"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return (
        matchesView &&
        matchesCategory &&
        (!search || searchable.includes(search))
      );
    });
    return [...filtered].sort((left, right) => {
      if (Boolean(left.is_pinned) !== Boolean(right.is_pinned)) {
        return left.is_pinned ? -1 : 1;
      }
      if (order === "active") {
        const leftActivity =
          Number(left.comment_count ?? 0) * 2 +
          Number(left.appreciation_count ?? 0);
        const rightActivity =
          Number(right.comment_count ?? 0) * 2 +
          Number(right.appreciation_count ?? 0);
        if (leftActivity !== rightActivity) return rightActivity - leftActivity;
      }
      return (
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime()
      );
    });
  }, [category, currentUserId, initialPosts, order, query, view]);
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

  function clearDiscovery() {
    setCategory("all");
    setOrder("newest");
    setQuery("");
    setView("all");
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("body") || "");
    const selectedCategory = String(form.get("category") || "discussion");
    setBusy("publish");
    const { error } = enhanced
      ? await supabase.rpc("create_structured_community_post", {
          p_body: body,
          p_category: selectedCategory,
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
      setComposerType("discussion");
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
    const { error } =
      kind === "comment"
        ? await supabase.rpc("delete_community_comment", {
            p_comment_id: id,
          })
        : await supabase.rpc("delete_community_post", {
            p_post_id: id,
          });
    setBusy("");
    announce(
      error,
      `remove this ${kind}`,
      `${kind === "post" ? "Post" : "Comment"} removed.`,
    );
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

  async function copyConversationLink(postId: string) {
    const target = new URL(window.location.href);
    target.hash = `conversation-${postId}`;
    try {
      await navigator.clipboard.writeText(target.toString());
      setMessage("Conversation link copied.");
    } catch {
      window.location.hash = `conversation-${postId}`;
      setMessage(
        "This conversation is now in your address bar. Copy the link from there.",
      );
    }
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
          <p className="eyebrow">The room</p>
          <h2 id="community-conversations-title">Exchange something useful.</h2>
        </div>
        <p>
          Ask clearly, offer generously and protect private context.
        </p>
      </header>

      {enhanced ? (
        <dl className="community-room-snapshot" aria-label="Recent room snapshot">
          <div>
            <dt>Recent conversations</dt>
            <dd>{initialPosts.length}</dd>
          </div>
          <div>
            <dt>Asks &amp; opportunities</dt>
            <dd>{roomSnapshot.asksAndOpportunities}</dd>
          </div>
          <div>
            <dt>Following</dt>
            <dd>{roomSnapshot.followed}</dd>
          </div>
          <div>
            <dt>Saved privately</dt>
            <dd>{roomSnapshot.saved}</dd>
          </div>
        </dl>
      ) : null}

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
                <select
                  name="category"
                  onChange={(event) => setComposerType(event.target.value)}
                  value={composerType}
                >
                  {availableTypes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {enhanced ? (
            <p className="community-composer-hint">
              {conversationTypeHints.get(composerType)}
            </p>
          ) : null}
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
        <section
          className="community-discovery"
          aria-label="Find and filter conversations"
        >
          <div className="community-feed-toolbar">
            <label>
              Find a conversation
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people, topics or words"
                type="search"
                value={query}
              />
            </label>
            <label>
              Topic
              <select
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                <option value="all">All topics</option>
                {availableTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Order
              <select
                onChange={(event) =>
                  setOrder(event.target.value as ConversationOrder)
                }
                value={order}
              >
                <option value="newest">Newest first</option>
                <option value="active">Most active</option>
              </select>
            </label>
          </div>
          <div
            className="community-conversation-filters"
            aria-label="Conversation views"
          >
            {[
              { label: "Latest", value: "all" },
              { label: "Following", value: "following" },
              { label: "Saved", value: "saved" },
              { label: "My conversations", value: "mine" },
            ].map((item) => (
              <button
                aria-pressed={view === item.value}
                key={item.value}
                onClick={() => setView(item.value as ConversationView)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            aria-live="polite"
            className="community-feed-results"
            role="status"
          >
            <span>
              Showing {posts.length} of {initialPosts.length} recent
              conversations
            </span>
            {query ||
            category !== "all" ||
            view !== "all" ||
            order !== "newest" ? (
              <button onClick={clearDiscovery} type="button">
                Clear filters
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="community-feed" aria-label="Community conversations">
        {posts.length ? (
          posts.map((post) => {
            const comments = commentsByPost.get(post.post_id) ?? [];
            return (
              <article
                className={post.is_pinned ? "is-pinned" : ""}
                id={`conversation-${post.post_id}`}
                key={post.post_id}
                tabIndex={-1}
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
                  <time dateTime={post.created_at}>
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
                      type="button"
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
                      type="button"
                    >
                      {post.saved_by_me ? "Saved" : "Save privately"}
                    </button>
                    <button
                      aria-pressed={Boolean(post.followed_by_me)}
                      disabled={busy === `followed-${post.post_id}`}
                      onClick={() => void setPostState(post, "followed")}
                      type="button"
                    >
                      {post.followed_by_me ? "Following" : "Follow replies"}
                    </button>
                    {canManage ? (
                      <button
                        aria-pressed={Boolean(post.is_pinned)}
                        disabled={busy === `pin-${post.post_id}`}
                        onClick={() => void pin(post)}
                        type="button"
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
                              <time dateTime={commentItem.created_at}>
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
                                  type="button"
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
                                  type="button"
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
                    <button
                      onClick={() => void copyConversationLink(post.post_id)}
                      type="button"
                    >
                      Copy conversation link
                    </button>
                    {post.author_id === currentUserId ? (
                      <button
                        disabled={busy === `remove-${post.post_id}`}
                        onClick={() => void remove(post.post_id, "post")}
                        type="button"
                      >
                        Remove post
                      </button>
                    ) : (
                      <button
                        disabled={busy === `report-${post.post_id}`}
                        onClick={() => void report(post.post_id, "post")}
                        type="button"
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
          <div className="admin-empty community-feed-empty">
            <strong>
              {initialPosts.length
                ? "No conversations match this view"
                : "Begin the conversation"}
            </strong>
            <p>
              {initialPosts.length
                ? "Try a broader search or return to the latest conversations."
                : "Share one focused thought, request, opportunity or resource that another member can act on."}
            </p>
            <button
              className="button button-outline"
              onClick={clearDiscovery}
              type="button"
            >
              {initialPosts.length ? "Clear filters" : "View all conversations"}
            </button>
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
