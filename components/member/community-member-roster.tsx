"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { CommunityAvatar } from "./community-avatar";
import { CommunityConnectionActions, type CommunityConnection } from "./community-connection-actions";

export type CommunityRosterMember = {
  avatar_url: string | null;
  city: string | null;
  company: string | null;
  country: string | null;
  display_name: string;
  job_title: string | null;
  industry?: string | null;
  membership_role: "member" | "moderator" | "owner";
  user_id: string;
};

export function CommunityMemberRoster({
  members: initialMembers,
  communityId,
  currentUserId,
  connections = [],
  connectionsReady = false,
}: {
  members: CommunityRosterMember[];
  communityId: string;
  currentUserId?: string;
  connections?: CommunityConnection[];
  connectionsReady?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [filters, setFilters] = useState({ query: "", industry: "", city: "" });
  const [offset, setOffset] = useState(0);
  const [industries, setIndustries] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    async function load() {
      try {
        const result = await supabase.rpc("search_community_people", { p_community_id: communityId, p_query: filters.query, p_industry: filters.industry, p_city: filters.city, p_offset: offset });
        if (result.error || !result.data) throw result.error || new Error("Members are unavailable. Please try again.");
        if (active) { setMembers(result.data.members); setIndustries(result.data.industries); setCities(result.data.cities); setHasMore(result.data.has_more); }
      } catch (cause) { if (active) { setMembers([]); setError(memberErrorMessage(cause, "find Community members")); } }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [communityId, filters, offset, retry, supabase]);
  function clearFilters() { setQuery(""); setIndustry(""); setCity(""); setFilters({ query: "", industry: "", city: "" }); setOffset(0); }

  return (
    <section
      aria-labelledby="community-members-title"
      className="community-member-roster"
      id="members"
    >
      <header>
        <div>
          <h2 id="community-members-title">People</h2>
        </div>
        <p>
          Messages open once you both agree to connect. Contact details stay private.
        </p>
      </header>
      <form className="community-people-filters" onSubmit={event => { event.preventDefault(); setOffset(0); setFilters({ query: query.trim(), industry, city }); }}>
        <label>Name or work<input maxLength={120} placeholder="Name, company or role" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label>Industry<select value={industry} onChange={event => setIndustry(event.target.value)}><option value="">All industries</option>{industries.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Location<select value={city} onChange={event => setCity(event.target.value)}><option value="">All locations</option>{cities.map(value => <option key={value}>{value}</option>)}</select></label>
        <button className="button button-primary" disabled={loading}>Search</button>
        {query || industry || city || filters.query || filters.industry || filters.city ? <button type="button" className="button button-outline" onClick={clearFilters}>Clear</button> : null}
      </form>
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : null}
      {loading ? <p role="status">Finding members…</p> : !error && !members.length ? <p role="status">No members match these filters. Try another industry or location, or clear your search.</p> : null}
      <div className="community-people-results" aria-busy={loading} hidden={loading || Boolean(error)}>
        {members.map((member) => (
          <article key={member.user_id}><Link href={member.user_id===currentUserId?"/profile":`/members/${member.user_id}`}>
            <CommunityAvatar name={member.display_name} src={member.avatar_url} />
            <strong>{member.display_name}</strong>
            {member.membership_role !== "member" ? <span className="community-role-badge">{member.membership_role === "owner" ? "Host" : "Moderator"}</span> : null}
            <small>
              {[member.job_title, member.company].filter(Boolean).join(" · ") ||
                "Community member"}
            </small>
            <small>
              {[member.city, member.country].filter(Boolean).join(", ")}
            </small>
            {member.industry ? <small>{member.industry}</small> : null}
          </Link><CommunityConnectionActions memberId={member.user_id} self={member.user_id===currentUserId} connection={connections.find(item=>item.other_user_id===member.user_id)??null} ready={connectionsReady} /></article>
        ))}
      </div>
      <footer>
        {offset > 0 ? <button type="button" className="button button-outline" disabled={loading} onClick={() => setOffset(value => Math.max(0, value - 16))}>Previous</button> : null}
        {hasMore && !error ? <button type="button" className="button button-outline" disabled={loading} onClick={() => setOffset(value => value + 16)}>Next members</button> : null}
        <Link className="button button-outline" href="/network">
          Browse all members
        </Link>
      </footer>
    </section>
  );
}
