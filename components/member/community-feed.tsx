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
  ["start_here", "Explain the community purpose, rules and best first step."],
  ["announcement", "Share an important update with every member."],
]);

type ConversationOrder = "active" | "newest";
type ConversationView = "all" | "following" | "mine" | "new" | "saved";
type AttachmentMode = "none" | "image" | "document" | "link";

export type CommunityPostAttachment = {
  asset_id: string;
  post_id: string;
  attachment_type: "image" | "document" | "link";
  storage_path: string | null;
  external_url: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  signed_url?: string | null;
};

export type CommunityPostEditState = {
  can_edit: boolean;
  edited_at: string | null;
  edit_expires_at: string;
  post_id: string;
};

export type CommunityPostReadState = {
  is_new: boolean;
  last_activity_at: string;
  new_reply_count: number;
  post_id: string;
};

export type CommunityFeedCursor = {
  activityAt: string;
  pinned: boolean;
  postId: string;
};

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
  can_edit?: boolean;
  created_at: string;
  cursor_activity_at?: string | null;
  edited_at?: string | null;
  edit_expires_at?: string | null;
  followed_by_me?: boolean;
  is_pinned?: boolean;
  is_new?: boolean;
  last_activity_at?: string | null;
  new_reply_count?: number;
  post_id: string;
  saved_by_me?: boolean;
  attachment?: CommunityPostAttachment | null;
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

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "application/pdf") return "pdf";
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

function fileSize(size: number | null) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function linkHost(url: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Secure external link";
  }
}

export function CommunityFeed({
  canManage,
  communityId,
  currentUserId,
  enhanced,
  initialComments,
  initialCursor = null,
  initialHasMore = false,
  initialNewActivityCount = 0,
  initialPosts,
  mediaReady = false,
  paginationReady = false,
  readStateReady = false,
  readOnly = false,
  prompt,
}: {
  canManage: boolean;
  communityId: string;
  currentUserId: string;
  enhanced: boolean;
  initialComments: CommunityComment[];
  initialCursor?: CommunityFeedCursor | null;
  initialHasMore?: boolean;
  initialNewActivityCount?: number;
  initialPosts: CommunityPost[];
  mediaReady?: boolean;
  paginationReady?: boolean;
  readStateReady?: boolean;
  readOnly?: boolean;
  prompt?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState("");
  const [attachmentAlt, setAttachmentAlt] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentMode, setAttachmentMode] =
    useState<AttachmentMode>("none");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [category, setCategory] = useState("all");
  const [composerType, setComposerType] = useState("discussion");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [message, setMessage] = useState("");
  const [olderComments, setOlderComments] = useState<CommunityComment[]>([]);
  const [olderPosts, setOlderPosts] = useState<CommunityPost[]>([]);
  const [order, setOrder] = useState<ConversationOrder>("newest");
  const [pageCursor, setPageCursor] =
    useState<CommunityFeedCursor | null>(initialCursor);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ConversationView>("all");
  const { ask, dialog } = useActionDialog();
  const availableTypes = canManage
    ? [...hostConversationTypes, ...conversationTypes]
    : [...conversationTypes];
  const allPosts = useMemo(() => {
    const unique = new Map<string, CommunityPost>();
    [...olderPosts, ...initialPosts].forEach((post) =>
      unique.set(post.post_id, post),
    );
    return [...unique.values()];
  }, [initialPosts, olderPosts]);
  const allComments = useMemo(() => {
    const unique = new Map<string, CommunityComment>();
    [...olderComments, ...initialComments].forEach((comment) =>
      unique.set(comment.comment_id, comment),
    );
    return [...unique.values()];
  }, [initialComments, olderComments]);
  const roomSnapshot = useMemo(
    () => ({
      asksAndOpportunities: allPosts.filter((post) =>
        ["ask", "opportunity"].includes(post.category ?? ""),
      ).length,
      followed: allPosts.filter((post) => post.followed_by_me).length,
      saved: allPosts.filter((post) => post.saved_by_me).length,
    }),
    [allPosts],
  );
  const posts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const filtered = allPosts.filter((post) => {
      const matchesView =
        view === "all" ||
        (view === "following" && post.followed_by_me) ||
        (view === "new" &&
          (post.is_new || Number(post.new_reply_count ?? 0) > 0)) ||
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
  }, [allPosts, category, currentUserId, order, query, view]);
  const commentsByPost = useMemo(() => {
    const grouped = new Map<string, CommunityComment[]>();
    allComments.forEach((comment) => {
      grouped.set(comment.post_id, [
        ...(grouped.get(comment.post_id) ?? []),
        comment,
      ]);
    });
    return grouped;
  }, [allComments]);

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

    let dimensions: { height: number; width: number } | null = null;
    try {
      if (attachmentMode === "image") {
        if (
          !attachmentFile ||
          !["image/jpeg", "image/png", "image/webp"].includes(
            attachmentFile.type,
          ) ||
          attachmentFile.size > 8 * 1024 * 1024
        ) {
          throw new Error("Choose a JPG, PNG or WebP image up to 8 MB.");
        }
        if (attachmentAlt.trim().length < 3) {
          throw new Error("Describe the image for members who cannot see it.");
        }
        dimensions = await inspectImage(attachmentFile);
        if (dimensions.width < 320 || dimensions.height < 180) {
          throw new Error("The image must be at least 320 × 180 px.");
        }
      }
      if (
        attachmentMode === "document" &&
        (!attachmentFile ||
          attachmentFile.type !== "application/pdf" ||
          attachmentFile.size > 10 * 1024 * 1024)
      ) {
        throw new Error("Choose a PDF document up to 10 MB.");
      }
      if (attachmentMode === "link") {
        const parsed = new URL(attachmentUrl);
        if (parsed.protocol !== "https:") {
          throw new Error("Use a secure link beginning with https://.");
        }
      }
    } catch (error) {
      setBusy("");
      setMessage(memberErrorMessage(error, "prepare this attachment"));
      return;
    }

    const creation = enhanced
      ? await supabase.rpc("create_structured_community_post", {
          p_body: body,
          p_category: selectedCategory,
          p_community_id: communityId,
        })
      : await supabase.rpc("create_community_post", {
          p_body: body,
          p_community_id: communityId,
        });

    if (creation.error || typeof creation.data !== "string") {
      setBusy("");
      setMessage(
        memberErrorMessage(
          creation.error ?? new Error("The post was not created."),
          "publish your community post",
        ),
      );
      return;
    }

    const postId = creation.data;
    try {
      if (mediaReady && attachmentMode !== "none") {
        let storagePath: string | null = null;
        if (attachmentFile) {
          storagePath = `${communityId}/posts/${postId}/${currentUserId}/${crypto.randomUUID()}.${extensionFor(attachmentFile)}`;
          const upload = await supabase.storage
            .from("community-media")
            .upload(storagePath, attachmentFile, {
              cacheControl: "31536000",
              contentType: attachmentFile.type,
              upsert: false,
            });
          if (upload.error) throw upload.error;
        }

        const attached = await supabase.rpc("attach_community_post_media", {
          p_alt_text:
            attachmentMode === "image" ? attachmentAlt.trim() : null,
          p_attachment_type: attachmentMode,
          p_external_url:
            attachmentMode === "link" ? attachmentUrl.trim() : null,
          p_height: dimensions?.height ?? null,
          p_mime_type: attachmentFile?.type ?? null,
          p_original_name: attachmentFile?.name ?? null,
          p_post_id: postId,
          p_size_bytes: attachmentFile?.size ?? null,
          p_storage_path: storagePath,
          p_width: dimensions?.width ?? null,
        });
        if (attached.error) throw attached.error;
      }
    } catch (error) {
      await supabase.rpc("delete_community_post", { p_post_id: postId });
      setBusy("");
      setMessage(
        `${memberErrorMessage(error, "attach this media")} The incomplete post was not published.`,
      );
      return;
    }

    setBusy("");
    setMessage("Your conversation is live in this community.");
    formElement.reset();
    setAttachmentAlt("");
    setAttachmentFile(null);
    setAttachmentMode("none");
    setAttachmentUrl("");
    setComposerType("discussion");
    router.refresh();
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

  async function edit(post: CommunityPost) {
    const result = await ask({
      title: "Edit this conversation?",
      description:
        "You can edit during the first 30 minutes. Previous versions remain private and are available only if this conversation is reported for safety review.",
      confirmLabel: "Save changes",
      fields: [
        {
          name: "body",
          label: "Conversation",
          type: "textarea",
          initialValue: post.body,
          required: true,
          minLength: 2,
          maxLength: 3000,
        },
      ],
    });
    if (!result) return;
    setBusy(`edit-${post.post_id}`);
    const { error } = await supabase.rpc("edit_community_post", {
      p_body: String(result.body),
      p_post_id: post.post_id,
    });
    setBusy("");
    announce(error, "edit this conversation", "Your changes are live.");
    if (!error) router.refresh();
  }

  async function markCaughtUp() {
    setBusy("catch-up");
    const { error } = await supabase.rpc("mark_community_caught_up", {
      p_community_id: communityId,
    });
    setBusy("");
    announce(
      error,
      "mark these community updates as seen",
      "You are caught up with this community.",
    );
    if (!error) router.refresh();
  }

  async function loadOlder() {
    if (!pageCursor || !hasMore || !paginationReady) return;
    setBusy("load-older");
    setMessage("");
    try {
      const pageResult = await supabase.rpc(
        "list_community_conversation_page",
        {
          p_before_activity_at: pageCursor.activityAt,
          p_before_pinned: pageCursor.pinned,
          p_before_post_id: pageCursor.postId,
          p_community_id: communityId,
          p_limit: 21,
        },
      );
      if (pageResult.error) throw pageResult.error;
      const page = (pageResult.data as CommunityPost[] | null) ?? [];
      const nextPosts = page.slice(0, 20);
      if (!nextPosts.length) {
        setHasMore(false);
        setMessage("You have reached the beginning of this community.");
        return;
      }

      const postIds = nextPosts.map((post) => post.post_id);
      const [commentResult, mediaResult] = await Promise.all([
        supabase.rpc("list_community_comments_for_posts", {
          p_community_id: communityId,
          p_limit: 500,
          p_post_ids: postIds,
        }),
        supabase.rpc("list_community_post_media_for_posts", {
          p_community_id: communityId,
          p_post_ids: postIds,
        }),
      ]);
      if (commentResult.error) throw commentResult.error;
      if (mediaResult.error) throw mediaResult.error;

      const attachments =
        (mediaResult.data as CommunityPostAttachment[] | null) ?? [];
      const signedAttachments = await Promise.all(
        attachments.map(async (attachment) => {
          if (!attachment.storage_path) return attachment;
          const signed = await supabase.storage
            .from("community-media")
            .createSignedUrl(attachment.storage_path, 3600);
          if (signed.error) throw signed.error;
          return {
            ...attachment,
            signed_url: signed.data.signedUrl,
          };
        }),
      );
      const attachmentByPost = new Map(
        signedAttachments.map((attachment) => [
          attachment.post_id,
          attachment,
        ]),
      );
      const enrichedPosts = nextPosts.map((post) => ({
        ...post,
        attachment: attachmentByPost.get(post.post_id) ?? null,
      }));
      const lastPost = nextPosts[nextPosts.length - 1];
      setOlderPosts((current) => [...current, ...enrichedPosts]);
      setOlderComments((current) => [
        ...current,
        ...((commentResult.data as CommunityComment[] | null) ?? []),
      ]);
      setHasMore(page.length > 20);
      setPageCursor({
        activityAt: lastPost.cursor_activity_at ?? lastPost.created_at,
        pinned: Boolean(lastPost.is_pinned),
        postId: lastPost.post_id,
      });
      setMessage(
        page.length > 20
          ? "Older conversations added."
          : "You have reached the beginning of this community.",
      );
    } catch (error) {
      setMessage(
        memberErrorMessage(error, "load older community conversations"),
      );
    } finally {
      setBusy("");
    }
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
          <p className="eyebrow">Community posts</p>
          <h2 id="community-conversations-title">Ask, share and support.</h2>
        </div>
        <p>
          Start a conversation, reply to a member or share something useful.
        </p>
      </header>

      {enhanced && allPosts.length ? (
        <dl className="community-room-snapshot" aria-label="Recent room snapshot">
          <div>
            <dt>Posts loaded</dt>
            <dd>{allPosts.length}</dd>
          </div>
          <div>
            <dt>Questions &amp; opportunities</dt>
            <dd>{roomSnapshot.asksAndOpportunities}</dd>
          </div>
          <div>
            <dt>Following</dt>
            <dd>{roomSnapshot.followed}</dd>
          </div>
          <div>
            <dt>{readStateReady ? "New for you" : "Saved privately"}</dt>
            <dd>
              {readStateReady ? initialNewActivityCount : roomSnapshot.saved}
            </dd>
          </div>
        </dl>
      ) : null}

      {enhanced && readStateReady && initialNewActivityCount > 0 ? (
        <div className="community-catchup-note">
          <div>
            <strong>
              {initialNewActivityCount} new update
              {initialNewActivityCount === 1 ? "" : "s"} since you last
              caught up
            </strong>
            <span>New conversations and replies are marked below.</span>
          </div>
          <button
            disabled={busy === "catch-up"}
            onClick={() => void markCaughtUp()}
            type="button"
          >
            {busy === "catch-up" ? "Updating…" : "Mark all as seen"}
          </button>
        </div>
      ) : null}

      {readOnly ? null : (
        <details
          className="community-composer-panel"
          open={!initialPosts.length}
        >
          <summary>
            <span>Start a conversation</span>
            <small>Ask, offer or share something useful</small>
          </summary>
          <form
            className="community-composer"
            onSubmit={(event) => void publish(event)}
          >
            <div className="community-composer-heading">
              <label htmlFor="community-post">
                {prompt ?? "Write a post"}
              </label>
              {enhanced ? (
                <label>
                  What are you sharing?
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
                  ? "Ask a clear question, offer help or share what happened after the event…"
                  : "Write an update, ask a question or share something useful…"
              }
            />
            {mediaReady ? (
              <div className="community-attachment-composer">
              <label>
                Add to your post <small>Optional</small>
                <select
                  onChange={(event) => {
                    setAttachmentMode(event.target.value as AttachmentMode);
                    setAttachmentAlt("");
                    setAttachmentFile(null);
                    setAttachmentUrl("");
                  }}
                  value={attachmentMode}
                >
                  <option value="none">No attachment</option>
                  <option value="image">Image</option>
                  <option value="document">PDF document</option>
                  <option value="link">Secure link</option>
                </select>
              </label>
              {attachmentMode === "image" ? (
                <>
                  <label>
                    Choose image
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        setAttachmentFile(event.target.files?.[0] ?? null)
                      }
                      required
                      type="file"
                    />
                    <small>JPG, PNG or WebP · 8 MB maximum.</small>
                  </label>
                  <label>
                    Image description
                    <input
                      maxLength={240}
                      minLength={3}
                      onChange={(event) => setAttachmentAlt(event.target.value)}
                      placeholder="Describe what the image shows"
                      required
                      value={attachmentAlt}
                    />
                  </label>
                </>
              ) : attachmentMode === "document" ? (
                <label>
                  Choose PDF
                  <input
                    accept="application/pdf"
                    onChange={(event) =>
                      setAttachmentFile(event.target.files?.[0] ?? null)
                    }
                    required
                    type="file"
                  />
                  <small>One PDF · 10 MB maximum.</small>
                </label>
              ) : attachmentMode === "link" ? (
                <label>
                  Secure link
                  <input
                    maxLength={2048}
                    onChange={(event) => setAttachmentUrl(event.target.value)}
                    placeholder="https://"
                    required
                    type="url"
                    value={attachmentUrl}
                  />
                  <small>Members will see the destination before opening it.</small>
                </label>
              ) : (
                <p>
                  Keep the feed focused. Each conversation can include one
                  image, PDF or secure link.
                </p>
              )}
              </div>
            ) : null}
            <div>
              <small>
                Only active members of this community can see this post. Share
                confidential details only in a private message.
              </small>
              <button
                className="button button-primary"
                disabled={busy === "publish"}
              >
                {busy === "publish" ? "Posting…" : "Post to community"}
              </button>
            </div>
          </form>
        </details>
      )}

      {enhanced && allPosts.length ? (
        <section
          className="community-discovery"
          aria-label="Find and filter conversations"
        >
          <div className="community-feed-toolbar">
            <label>
              Search posts
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by person, topic or word"
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
                <option value="all">All post types</option>
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
              ...(readStateReady
                ? [{ label: "New for you", value: "new" }]
                : []),
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
              Showing {posts.length} of {allPosts.length} loaded posts
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
                className={[
                  post.is_pinned ? "is-pinned" : "",
                  post.is_new || Number(post.new_reply_count ?? 0) > 0
                    ? "has-new-activity"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
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
                    {post.is_new || Number(post.new_reply_count ?? 0) > 0 ? (
                      <span className="community-post-new-label">
                        {post.is_new ? "New conversation" : "New activity"}
                        {Number(post.new_reply_count ?? 0) > 0
                          ? ` · ${post.new_reply_count} new repl${Number(post.new_reply_count) === 1 ? "y" : "ies"}`
                          : ""}
                      </span>
                    ) : null}
                    <strong>{post.author_name}</strong>
                    <small>
                      {[post.author_role, post.author_company]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  <div className="community-post-timestamp">
                    <time dateTime={post.created_at}>
                      {new Intl.DateTimeFormat("en-KE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(post.created_at))}
                    </time>
                    {post.edited_at ? <small>Edited</small> : null}
                  </div>
                </header>
                <p>{post.body}</p>
                {post.attachment?.attachment_type === "image" &&
                post.attachment.signed_url ? (
                  <figure className="community-post-image">
                    <img
                      alt={post.attachment.alt_text ?? ""}
                      height={post.attachment.height ?? undefined}
                      loading="lazy"
                      src={post.attachment.signed_url}
                      width={post.attachment.width ?? undefined}
                    />
                    {post.attachment.original_name ? (
                      <figcaption>{post.attachment.original_name}</figcaption>
                    ) : null}
                  </figure>
                ) : post.attachment?.attachment_type === "document" &&
                  post.attachment.signed_url ? (
                  <a
                    className="community-post-document"
                    href={post.attachment.signed_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span aria-hidden="true">PDF</span>
                    <div>
                      <strong>
                        {post.attachment.original_name ?? "Community document"}
                      </strong>
                      <small>
                        Protected PDF
                        {post.attachment.size_bytes
                          ? ` · ${fileSize(post.attachment.size_bytes)}`
                          : ""}
                      </small>
                    </div>
                    <em>Open</em>
                  </a>
                ) : post.attachment?.attachment_type === "link" &&
                  post.attachment.external_url ? (
                  <a
                    className="community-post-link"
                    href={post.attachment.external_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <div>
                      <span>Shared link</span>
                      <strong>
                        {linkHost(post.attachment.external_url)}
                      </strong>
                    </div>
                    <em>Open securely ↗</em>
                  </a>
                ) : null}

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
                      <>
                        {post.can_edit ? (
                          <button
                            disabled={busy === `edit-${post.post_id}`}
                            onClick={() => void edit(post)}
                            type="button"
                          >
                            Edit post
                          </button>
                        ) : null}
                        <button
                          disabled={busy === `remove-${post.post_id}`}
                          onClick={() => void remove(post.post_id, "post")}
                          type="button"
                        >
                          Remove post
                        </button>
                      </>
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
              {allPosts.length
                ? "No conversations match this view"
                : "Begin the conversation"}
            </strong>
            <p>
              {allPosts.length
                ? "Try a broader search or return to the latest conversations."
                : "Share one focused thought, request, opportunity or resource that another member can act on."}
            </p>
            {allPosts.length ? (
              <button
                className="button button-outline"
                onClick={clearDiscovery}
                type="button"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        )}
      </section>
      {enhanced && paginationReady && (hasMore || olderPosts.length) ? (
        <div className="community-feed-pagination">
          {hasMore ? (
            <button
              className="button button-outline"
              disabled={busy === "load-older"}
              onClick={() => void loadOlder()}
              type="button"
            >
              {busy === "load-older"
                ? "Loading conversations…"
                : "Load older conversations"}
            </button>
          ) : (
            <strong>You are at the beginning of this community.</strong>
          )}
          <span>Conversations load in calm, manageable groups of 20.</span>
        </div>
      ) : null}
      {message ? (
        <p className="network-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
