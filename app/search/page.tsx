import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchResult = {
  result_type: "member" | "community" | "conversation" | "event" | "learning";
  result_id: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  href: string;
  occurred_at: string;
};

const labels: Record<SearchResult["result_type"], string> = {
  member: "Member",
  community: "Community",
  conversation: "Community post",
  event: "Event",
  learning: "Learning",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 80);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.access_status !== "active") redirect("/home");

  const result = query.length >= 2
    ? await supabase.rpc("search_my_table", { p_limit: 30, p_query: query })
    : { data: [], error: null };
  const results = (result.data as SearchResult[] | null) ?? [];

  return (
    <main className="member-search-page">
      <MemberHeader active="search" label="Search" />
      <section className="member-search-hero">
        <p className="eyebrow">Find what matters</p>
        <h1>Search your table.</h1>
        <p>
          Find a member, a Community conversation, an event or useful learning.
          You will only see information you already have permission to open.
        </p>
        <form action="/search" method="get" role="search">
          <label htmlFor="member-search">What are you looking for?</label>
          <div>
            <input
              autoComplete="off"
              defaultValue={query}
              id="member-search"
              maxLength={80}
              minLength={2}
              name="q"
              placeholder="Try a name, topic, city or skill"
              required
              type="search"
            />
            <button className="button button-primary">Search</button>
          </div>
        </form>
      </section>

      {result.error ? (
        <section className="member-search-state" role="alert">
          <strong>Search is being prepared.</strong>
          <p>Your member areas are unchanged. Try again after setup is complete.</p>
          <Link href="/explore">Browse member tools</Link>
        </section>
      ) : query.length < 2 ? (
        <section className="member-search-state">
          <strong>Start with two or more letters.</strong>
          <p>Search by a person’s name, her work, a Community topic or an event.</p>
        </section>
      ) : results.length ? (
        <section className="member-search-results" aria-label="Search results">
          <header>
            <p><strong>{results.length}</strong> result{results.length === 1 ? "" : "s"} for “{query}”</p>
            <Link href="/search">Clear search</Link>
          </header>
          <div>
            {results.map((item) => (
              <Link href={item.href} key={`${item.result_type}-${item.result_id}`}>
                <span>{labels[item.result_type]}</span>
                <strong>{item.title}</strong>
                {item.subtitle ? <small>{item.subtitle}</small> : null}
                {item.excerpt ? <p>{item.excerpt}</p> : null}
                <em>Open →</em>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="member-search-state">
          <strong>No result for “{query}”.</strong>
          <p>Try fewer words, a person’s name, a city or a broader topic.</p>
          <Link href="/explore">Browse member tools</Link>
        </section>
      )}
    </main>
  );
}
