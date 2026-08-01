"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CommunityCircleOption = {
  cycle_id: string;
  cycle_name: string;
  cycle_description: string;
  cycle_status: "completed" | "matched" | "open" | "published";
  starts_at: string;
  ends_at: string;
  group_size: number;
  is_linked: boolean;
};

export function CommunityCircleHostPanel({
  communityId,
  migrationReady,
  options,
}: {
  communityId: string;
  migrationReady: boolean;
  options: CommunityCircleOption[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function update(option: CommunityCircleOption) {
    setBusy(option.cycle_id);
    setMessage("");
    const { error } = await supabase.rpc(
      "set_community_circle_cycle_link",
      {
        p_community_id: communityId,
        p_cycle_id: option.cycle_id,
        p_linked: !option.is_linked,
      },
    );
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "update this Circle connection")
        : option.is_linked
          ? "Circle cycle removed from this community. Circle memberships are unchanged."
          : "Circle cycle added to this community.",
    );
    if (!error) router.refresh();
  }

  return (
    <section className="community-circle-host" id="circle-programming">
      <header>
        <div>
          <p className="eyebrow">Circle programming</p>
          <h2>Connect a smaller table.</h2>
        </div>
        <p>
          Curate relevant Circle cycles without seeing matching notes, private
          rosters or member reflections.
        </p>
      </header>
      {!migrationReady ? (
        <div className="community-host-unavailable" role="status">
          <strong>Circle linking is behind its release gate.</strong>
          <p>
            This control appears after both Community and Circles pass their
            database and privacy acceptance checks.
          </p>
        </div>
      ) : options.length ? (
        <div className="community-circle-host-list">
          {options.map((option) => (
            <article key={option.cycle_id}>
              <div>
                <span>
                  {option.cycle_status} · {option.group_size} per Circle
                </span>
                <strong>{option.cycle_name}</strong>
                <p>{option.cycle_description}</p>
              </div>
              <button
                className={
                  option.is_linked
                    ? "button button-outline"
                    : "button button-primary"
                }
                disabled={busy === option.cycle_id}
                onClick={() => void update(option)}
                type="button"
              >
                {busy === option.cycle_id
                  ? "Updating…"
                  : option.is_linked
                    ? "Remove from community"
                    : "Add to community"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty">
          <strong>No released Circle cycle is available.</strong>
          <p>
            Circle cycles appear here only after the platform team opens or
            publishes them.
          </p>
        </div>
      )}
      {message ? (
        <p className="network-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
