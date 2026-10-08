"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";
import { communityDraftKey, readCommunityDraft, writeCommunityDraft } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";
import { useCommunityFileGuard } from "@/lib/use-community-file-guard";
import { CommunityReplyForm } from "./community-reply-form";
import {CommunityAttachmentRetry} from "./community-attachment-retry";
import {signCommunityAttachments} from "@/lib/community-attachment-delivery";

const conversationTypes = [
  { label: "Questions & ideas", value: "discussion" },
  { label: "Introduction", value: "introduction" },
  { label: "Ask for help", value: "ask" },
  { label: "Offer help", value: "offer" },
  { label: "Opportunity", value: "opportunity" },
  { label: "Useful links", value: "resource" },
  { label: "After a gathering", value: "event_follow_up" },
  { label: "Good news", value: "win" },
] as const;

const hostConversationTypes = [
  { label: "Start here", value: "start_here" },
  { label: "Announcement", value: "announcement" },
] as const;

const everydayTopics = new Set(["discussion", "introduction", "ask", "opportunity", "resource"]);

const categoryLabels = new Map<string, string>([
  ...conversationTypes.map((item) => [item.value, item.label] as const),
  ["start_here", "Start here"],
  ["announcement", "Announcement"],
]);

const conversationTypeHints = new Map<string, string>([
  ["discussion", "Ask a question or share something you would like to discuss."],
  ["introduction", "Tell members a little about yourself."],
  ["ask", "Tell members what you need help with."],
  ["offer", "Offer a skill, introduction or resource another member can use."],
  ["opportunity", "Explain the opportunity and how someone can take part."],
  ["resource", "Share a useful link or file and explain why you recommend it."],
  ["event_follow_up", "Share a memory, question or update after a gathering."],
  ["win", "Share your good news and thank anyone who helped."],
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
  initialComposerType = "discussion",
  initialCursor = null,
  initialHasMore = false,
  initialNewActivityCount = 0,
  initialPosts,
  composerInitiallyOpen = false,
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
  initialComposerType?: string;
  initialCursor?: CommunityFeedCursor | null;
  initialHasMore?: boolean;
  initialNewActivityCount?: number;
  initialPosts: CommunityPost[];
  composerInitiallyOpen?: boolean;
  mediaReady?: boolean;
  paginationReady?: boolean;
  readStateReady?: boolean;
  readOnly?: boolean;
  prompt?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState("");
  const [composerBody, setComposerBody] = useCommunityDraft(communityDraftKey(currentUserId, "community-post", communityId), "");
  const [attachmentAlt, setAttachmentAlt] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentMode, setAttachmentMode] =
    useState<AttachmentMode>("none");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [category, setCategory] = useState("all");
  const [moreTopics, setMoreTopics] = useState(false);
  const [morePostTypes, setMorePostTypes] = useState(false);
  const availableTypes = canManage
    ? [...hostConversationTypes, ...conversationTypes]
    : [...conversationTypes];
  const [composerType, setComposerType, clearComposerType] = useCommunityDraft(communityDraftKey(currentUserId, "community-post-category", communityId),
    availableTypes.some((item) => item.value === initialComposerType)
      ? initialComposerType
      : "discussion",
  );
  const [composerExpanded, setComposerExpanded] = useState(
    composerInitiallyOpen || Boolean(composerBody),
  );
  useEffect(() => {
    function revealComposer() {
      if (window.location.hash === "#create-conversation") setComposerExpanded(true);
    }
    revealComposer();
    window.addEventListener("hashchange", revealComposer);
    return () => window.removeEventListener("hashchange", revealComposer);
  }, []);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [message, setMessage] = useState("");
  const [olderComments, setOlderComments] = useState<CommunityComment[]>([]);
  const [olderPosts, setOlderPosts] = useState<CommunityPost[]>([]);
  const [order, setOrder] = useState<ConversationOrder>("newest");
  const [pageCursor, setPageCursor] =
    useState<CommunityFeedCursor | null>(initialCursor);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ConversationView>("all");
  const [browseRestored, setBrowseRestored] = useState<string | null>(null);
  const browseKey = communityDraftKey(currentUserId, "community-browse", communityId);
  useEffect(() => {
    const saved = readCommunityDraft<{ category: string; query: string; view: ConversationView; order: ConversationOrder }>(browseKey);
    if (enhanced && saved) {
      if (saved.category === "all" || categoryLabels.has(saved.category)) setCategory(saved.category);
      if (typeof saved.query === "string") setQuery(saved.query.slice(0, 120));
      if (["all", "following", "mine", "new", "saved"].includes(saved.view)) setView(saved.view);
      if (["active", "newest"].includes(saved.order)) setOrder(saved.order);
    } else if (!enhanced) { setCategory("all"); setQuery(""); setView("all"); setOrder("newest"); }
    setBrowseRestored(browseKey);
  }, [browseKey, enhanced]);
  useEffect(() => {
    if (enhanced && browseRestored === browseKey) writeCommunityDraft(browseKey, { category, query, view, order });
  }, [browseKey, browseRestored, category, query, view, order, enhanced]);
  const [searchPosts, setSearchPosts] = useState<CommunityPost[]>([]);
  const [searchComments, setSearchComments] = useState<CommunityComment[]>([]);
  const [searchCursor, setSearchCursor] = useState<CommunityFeedCursor | null>(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [failedAttachments,setFailedAttachments]=useState<Set<string>>(()=>new Set());
  const searchVersion = useRef(0);
  const serverFiltering = enhanced && paginationReady && (category !== "all" || Boolean(query.trim()) || view !== "all");
  const visibleHasMore = serverFiltering ? searchHasMore : hasMore;
  useEffect(() => {
    const version = ++searchVersion.current;
    if (!serverFiltering) { setSearchPosts([]); setSearchComments([]); setSearchCursor(null); setSearchHasMore(false); setBusy(previous => previous === "search" || previous === "load-older" ? "" : previous); return; }
    setSearchPosts([]); setSearchComments([]); setSearchHasMore(false); setBusy("search");
    const timer = window.setTimeout(() => void loadPage(true, version), 350);
    return () => { window.clearTimeout(timer); searchVersion.current++; };
  }, [category, query, view, communityId, serverFiltering, initialPosts]);
  const { ask, dialog } = useActionDialog();
  useCommunityFileGuard(Boolean(attachmentFile), { ask, busy: busy === "publish", discard: () => setAttachmentFile(null), blocked: () => setMessage("Please wait until your post finishes saving before leaving.") });
  const allPosts = useMemo(() => {
    const unique = new Map<string, CommunityPost>();
    (serverFiltering ? searchPosts : [...olderPosts, ...initialPosts]).forEach((post) =>
      unique.set(post.post_id, post),
    );
    return [...unique.values()];
  }, [initialPosts, olderPosts, searchPosts, serverFiltering]);
  const allComments = useMemo(() => {
    const unique = new Map<string, CommunityComment>();
    (serverFiltering ? searchComments : [...olderComments, ...initialComments]).forEach((comment) =>
      unique.set(comment.comment_id, comment),
    );
    return [...unique.values()];
  }, [initialComments, olderComments, searchComments, serverFiltering]);
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
        (serverFiltering || !search || searchable.includes(search))
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
  }, [allPosts, category, currentUserId, order, query, view, serverFiltering]);
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
    setComposerBody("");
    formElement.reset();
    setAttachmentAlt("");
    setAttachmentFile(null);
    setAttachmentMode("none");
    setAttachmentUrl("");
    clearComposerType("discussion");
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
    return !error;
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
        "Choose what worries you and tell the Her Africa Table safety team what happened.",
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
      "Your report was sent privately to the Her Africa Table safety team.",
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
    await loadPage();
  }
  async function loadPage(reset = false, version = searchVersion.current) {
    const cursor = serverFiltering ? searchCursor : pageCursor;
    if (!reset && (!cursor || !visibleHasMore || !paginationReady)) return;
    setBusy(reset ? "search" : "load-older");
    setMessage("");
    try {
      const pageResult = await supabase.rpc(
        serverFiltering ? "search_community_conversation_page" : "list_community_conversation_page",
        {
          p_before_activity_at: reset ? null : cursor?.activityAt,
          p_before_pinned: reset ? null : cursor?.pinned,
          p_before_post_id: reset ? null : cursor?.postId,
          p_community_id: communityId,
          p_limit: 21,
          ...(serverFiltering ? { p_category: category === "all" ? null : category, p_search: query.trim() || null, p_view: view } : {}),
        },
      );
      if (version !== searchVersion.current) return;
      if (pageResult.error) throw pageResult.error;
      const page = (pageResult.data as CommunityPost[] | null) ?? [];
      const nextPosts = page.slice(0, 20);
      if (!nextPosts.length) {
        if (serverFiltering) setSearchHasMore(false); else setHasMore(false);
        setMessage(serverFiltering ? "No more conversations match your search." : "You have reached the beginning of this community.");
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
      const signedAttachments = await signCommunityAttachments(supabase,attachments);
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
      if (version !== searchVersion.current) return;
      const comments = (commentResult.data as CommunityComment[] | null) ?? [];
      if (serverFiltering) {
        setSearchPosts(current => reset ? enrichedPosts : [...current, ...enrichedPosts]);
        setSearchComments(current => reset ? comments : [...current, ...comments]);
        setSearchHasMore(page.length > 20);
      } else {
        setOlderPosts(current => [...current, ...enrichedPosts]);
        setOlderComments(current => [...current, ...comments]);
        setHasMore(page.length > 20);
      }
      const nextCursor = {
        activityAt: lastPost.cursor_activity_at ?? lastPost.created_at,
        pinned: Boolean(lastPost.is_pinned),
        postId: lastPost.post_id,
      };
      if (serverFiltering) setSearchCursor(nextCursor); else setPageCursor(nextCursor);
      setMessage(
        page.length > 20
          ? "Older conversations added."
          : serverFiltering ? "All matching conversations loaded." : "You have reached the beginning of this community.",
      );
    } catch (error) {
      if (version !== searchVersion.current) return;
      setMessage(
        memberErrorMessage(error, "load older community conversations"),
      );
    } finally {
      if (version === searchVersion.current) setBusy("");
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
          <h2 id="community-conversations-title">Conversations</h2>
        </div>
        {enhanced ? <label className="community-topic-picker">
          Browse topics
          <select value={category} onChange={event => event.target.value === "more" ? setMoreTopics(true) : setCategory(event.target.value)}>
            <option value="all">All topics</option>
            <optgroup label="Everyday conversations">{conversationTypes.filter(item => everydayTopics.has(item.value)).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>
            {moreTopics || (category !== "all" && !everydayTopics.has(category)) ? <optgroup label="More topics">{[...hostConversationTypes, ...conversationTypes.filter(item => !everydayTopics.has(item.value))].map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup> : <option value="more">More topics…</option>}
          </select>
        </label> : <p>Ask a question, offer help or share an update.</p>}
      </header>
      {enhanced && category !== "all" ? <p className="community-composer-hint" role="status">{categoryLabels.get(category)} · {posts.length} conversation{posts.length === 1 ? "" : "s"} shown{visibleHasMore ? ". More matching conversations are available below." : "."} <button type="button" onClick={() => setCategory("all")}>Show all topics</button></p> : null}

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
          id="create-conversation"
          onToggle={(event) => setComposerExpanded(event.currentTarget.open)}
          open={composerExpanded}
        >
          <summary>
            <span>{composerBody ? "Continue your post" : "Start a conversation"}</span>
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
                    onChange={(event) => event.target.value === "more" ? setMorePostTypes(true) : setComposerType(event.target.value)}
                    value={composerType}
                  >
                    <optgroup label="Everyday conversations">{availableTypes.filter(item => everydayTopics.has(item.value)).map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}</optgroup>
                    {morePostTypes || !everydayTopics.has(composerType) ? <optgroup label="More topics">{availableTypes.filter(item => !everydayTopics.has(item.value)).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup> : <option value="more">More topics…</option>}
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
              value={composerBody}
              onChange={event => setComposerBody(event.target.value)}
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
        <details
          aria-label="Find and filter conversations"
          className="community-discovery"
        >
          <summary>
            <span>Find conversations</span>
            <small>Search or filter posts</small>
          </summary>
          <div className="community-discovery-controls">
          <div className="community-feed-toolbar">
            <label>
              Search posts
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by person or words"
                maxLength={120}
                type="search"
                value={query}
              />
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
                <option value="active">Most active in this view</option>
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
          </div>
        </details>
      ) : null}

      <section className="community-feed" aria-label="Community conversations">
        {busy === "search" ? <p role="status">Finding conversations…</p> : posts.length ? (
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
                        {post.is_new ? "New conversation" : "New reply"}
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
                post.attachment.signed_url && !failedAttachments.has(post.attachment.asset_id) ? (
                  <figure className="community-post-image">
                    <img
                      alt={post.attachment.alt_text ?? ""}
                      height={post.attachment.height ?? undefined}
                      loading="lazy"
                      src={post.attachment.signed_url}
                      onError={()=>setFailedAttachments(current=>new Set(current).add(post.attachment!.asset_id))}
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
                ) : post.attachment && ["image","document"].includes(post.attachment.attachment_type) ? <CommunityAttachmentRetry key={`${currentUserId}:${communityId}:${post.post_id}:${post.attachment.asset_id}`} communityId={communityId} postId={post.post_id}/> : null}

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
                      <CommunityReplyForm accountId={currentUserId} postId={post.post_id}
                        busy={busy === `comment-${post.post_id}`} onSubmit={event => comment(event, post.post_id)} />
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
              {serverFiltering || allPosts.length
                ? "No conversations match this view"
                : "Begin the conversation"}
            </strong>
            <p>
              {serverFiltering || allPosts.length
                ? "Try a broader search or return to the latest conversations."
                : "Share one focused thought, request, opportunity or resource that another member can act on."}
            </p>
            {serverFiltering || allPosts.length ? (
              <button
                className="button button-outline"
                onClick={clearDiscovery}
                type="button"
              >
                Clear filters
              </button>
            ) : null}
            {serverFiltering && message ? <button type="button" className="button button-outline" onClick={() => void loadPage(true)}>Try search again</button> : null}
          </div>
        )}
      </section>
      {enhanced && paginationReady && (visibleHasMore || (serverFiltering ? searchPosts.length : olderPosts.length)) ? (
        <div className="community-feed-pagination">
          {visibleHasMore ? (
            <button
              className="button button-outline"
              disabled={busy === "load-older"}
              onClick={() => void loadOlder()}
              type="button"
            >
              {busy === "load-older"
                ? "Loading conversations…"
                : serverFiltering ? "More matching conversations" : "Load older conversations"}
            </button>
          ) : (
            <strong>{serverFiltering ? "All matching conversations loaded." : "You are at the beginning of this community."}</strong>
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
