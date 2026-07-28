import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OpportunityMarketplace, type MarketplacePost, type MarketplaceResponse } from "@/components/member/opportunity-marketplace";
import { MemberHeader } from "@/components/member/member-header";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ category?: string; mine?: string; q?: string; type?: string }> }) {
  const filters = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase.from("profiles").select("access_status").eq("id", user.id).maybeSingle();
  if (profile?.access_status !== "active") redirect("/home");
  const result = await supabase.rpc("list_marketplace_posts", { p_category: filters.category || null, p_limit: 50, p_offset: 0, p_post_type: filters.type || null, p_search: filters.q || null });
  const allPosts = (result.data as MarketplacePost[] | null) ?? [];
  const posts = filters.mine === "1" ? allPosts.filter((post) => post.author_id === user.id || post.own_response_status) : allPosts;
  const owned = posts.filter((post) => post.author_id === user.id);
  const responseResults = await Promise.all(owned.map((post) => supabase.rpc("list_marketplace_responses", { p_post_id: post.post_id })));
  const responses = responseResults.flatMap((response, index) => ((response.data as Omit<MarketplaceResponse, "post_id">[] | null) ?? []).map((item) => ({ ...item, post_id: owned[index].post_id })));
  return <main className="opportunity-page"><MemberHeader label="Asks & Offers"/><section className="opportunity-hero"><div><p className="eyebrow">Member exchange</p><h1>Ask clearly.<br />Offer generously.</h1><p>Share a focused need, skill, introduction or opportunity with trusted members. Responses stay private between you and the post owner.</p></div><a className="button button-primary" href="#create-opportunity">Create a post</a></section>{result.error ? <section className="admin-empty opportunity-error"><strong>Asks &amp; Offers are temporarily unavailable</strong><p>Please try again or contact support if the problem continues.</p><div className="journey-state-actions"><Link className="button button-primary" href="/opportunities">Try again</Link><Link className="button button-outline" href="/support">Contact support</Link></div></section> : <OpportunityMarketplace currentUserId={user.id} initialPosts={posts} initialResponses={responses} />}</main>;
}
