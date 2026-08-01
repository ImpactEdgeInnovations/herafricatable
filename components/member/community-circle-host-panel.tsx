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

function statusLabel(status: CommunityCircleOption["cycle_status"]) {
  if (status === "open") return "Open to join";
  if (status === "matched") return "Groups being prepared";
  if (status === "published") return "Groups open";
  return "Completed";
}

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
          ? "This Circle programme is now hidden from the community. Existing Circle groups are unchanged."
          : "This Circle programme is now visible in the community.",
    );
    if (!error) router.refresh();
  }

  return (
    <section className="community-circle-host" id="circle-programming">
      <header>
        <div>
          <p className="eyebrow">Small-group programme</p>
          <h2>Add a Circle programme.</h2>
        </div>
        <p>
          Choose which available Circle programme members can see. Matching,
          member lists and private responses stay with the platform team.
        </p>
      </header>
      {!migrationReady ? (
        <div className="community-host-unavailable" role="status">
          <strong>Circle options are not ready yet.</strong>
          <p>
            This section will open after the Community and Circles features
            have completed their safety checks.
          </p>
        </div>
      ) : options.length ? (
        <div className="community-circle-host-list">
          {options.map((option) => (
            <article key={option.cycle_id}>
              <div>
                <span>
                  {statusLabel(option.cycle_status)} · Up to {option.group_size} members
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
                    ? "Hide from community"
                    : "Show in community"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty">
          <strong>No Circle programme is available.</strong>
          <p>
            An available Circle programme will appear here when the platform
            team opens it.
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
