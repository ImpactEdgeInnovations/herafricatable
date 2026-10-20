import Link from "next/link";
import type { CommunityPost } from "./community-feed";

/** A small, member-authorised preview; replies and media load when opened. */
export function CommunityHomeConversations({ posts, slug, unavailable, readOnly }: {
  posts: CommunityPost[]; slug: string; unavailable: boolean; readOnly: boolean;
}) {
  const conversations = `/communities/${slug}?view=conversations`;
  return <section className="community-home-conversations" aria-labelledby="community-latest-title">
    <header>
      <div><h2 id="community-latest-title">Latest conversations</h2><p>See what members are talking about.</p></div>
      {!readOnly ? <Link className="community-start-primary" href={`${conversations}#create-conversation`}>Start a conversation</Link> : null}
    </header>
    {unavailable ? <div className="community-home-empty" role="status"><p>Conversations could not load just now.</p><Link href={conversations}>Try opening conversations</Link></div>
      : posts.length ? <div className="community-home-posts">{posts.slice(0, 3).map(post => { const created = new Date(post.created_at); return <Link key={post.post_id} href={`${conversations}#conversation-${post.post_id}`}>
        <span className="community-home-avatar" aria-hidden="true">{(post.author_name || "Member").trim().slice(0, 1).toUpperCase()}</span>
        <div className="community-home-post-author"><strong>{post.author_name || "Community member"}</strong>{post.is_pinned ? <span>Pinned by the Host</span> : null}{Number.isFinite(created.getTime()) ? <time dateTime={created.toISOString()}>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }).format(created)}</time> : null}</div>
        <p>{post.body}</p>
        <small>{Number(post.comment_count ?? 0)} {Number(post.comment_count ?? 0) === 1 ? "reply" : "replies"}<span aria-hidden="true"> · </span>Read conversation →</small>
      </Link>; })}</div>
      : <div className="community-home-empty"><strong>{readOnly ? "No conversations yet" : "Be the first to say hello"}</strong><p>{readOnly ? "Past conversations will appear here when available." : "Share what brought you here or ask one simple question. Only members of this Community can take part."}</p></div>}
    {posts.length ? <footer><Link href={conversations}>See all conversations →</Link></footer> : null}
  </section>;
}
