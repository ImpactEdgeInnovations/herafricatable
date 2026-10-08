"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import type { CommunityEventProposal } from "@/components/community/community-event-proposal-panel";

const ProposalPanel = dynamic(
  () => import("@/components/community/community-event-proposal-panel").then(module => module.CommunityEventProposalPanel),
  { loading: () => <p role="status">Opening gathering tools…</p> },
);

// Mounted only after a Host opens the planner; the RPC independently checks Host access.
export function CommunityGatheringPlanner({ communityId, slug, currentUserId }: {
  communityId: string;
  slug: string;
  currentUserId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [proposals, setProposals] = useState<CommunityEventProposal[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef(false);
  useEffect(() => {
    let active = true;
    if (!loaded.current) setStatus("loading");
    async function load() {
      try {
        const { data, error } = await supabase.rpc("list_my_community_event_proposals", { p_community_id: communityId });
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error("Gathering tools unavailable");
        if (!active) return;
        setProposals(data as CommunityEventProposal[]);
        loaded.current = true;
        setMessage("");
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        setMessage(memberErrorMessage(error, "open gathering tools"));
        if (!loaded.current) setStatus("error");
      }
    }
    void load();
    return () => { active = false; };
  }, [communityId, supabase, attempt]);

  if (status === "loading") return <p role="status">Loading your gathering drafts…</p>;
  if (status === "error") return <div role="alert"><p>{message}</p><button type="button" className="button button-outline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>;
  return <>{message ? <div role="alert"><p>{message} Your open form is still here.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Refresh drafts</button></div> : null}<ProposalPanel communityId={communityId} communitySlug={slug} currentUserId={currentUserId} proposals={proposals} migrationReady startExpanded onSaved={() => setAttempt(value => value + 1)} /></>;
}
