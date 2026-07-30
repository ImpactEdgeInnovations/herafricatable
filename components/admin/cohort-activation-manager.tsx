"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CohortEvent = {
  id: string;
  starts_at: string;
  status: string;
  title: string;
};

export type CohortOverview = {
  active_count: number;
  cohort_status: "active" | "draft" | "read_only";
  community_id: string;
  community_name: string;
  community_slug: string;
  eligibility_scope: "active_members" | "confirmed_event";
  event_id: string | null;
  event_title: string | null;
  follow_up_until: string | null;
  introduction_count: number;
  introduction_prompt: string;
  invited_count: number;
  welcome_message: string;
};

export type CohortHealthMember = {
  accepted_connections: number;
  display_name: string;
  email: string;
  event_status: string | null;
  introduction_complete: boolean;
  joined_at: string | null;
  membership_status: string;
  profile_completion: number;
  user_id: string;
};

export function CohortActivationManager({
  cohorts,
  events,
  health,
  migrationReady,
  selectedId,
}: {
  cohorts: CohortOverview[];
  events: CohortEvent[];
  health: CohortHealthMember[];
  migrationReady: boolean;
  selectedId: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const selected =
    cohorts.find((cohort) => cohort.community_id === selectedId) ?? cohorts[0];

  async function createFoundingRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const eventId = String(form.get("event_id") ?? "");
    setBusy("create");
    setMessage("");
    const { data, error } = await supabase.rpc("ensure_founding_cohort", {
      p_event_id: eventId,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "prepare the founding cohort")
        : "The private Nairobi founding room is ready. Eligible guests are not enrolled until you send invitations.",
    );
    if (!error) {
      router.push(`/admin/cohort?community=${data}`);
      router.refresh();
    }
  }

  async function syncInvitations() {
    if (!selected) return;
    const confirmed = await ask({
      title: "Invite every currently eligible member?",
      description:
        "This creates consent-based invitations only. Nobody enters the room until she accepts. Re-running the sync will not duplicate invitations.",
      confirmLabel: "Send invitations",
    });
    if (!confirmed) return;
    setBusy("sync");
    setMessage("");
    const { data, error } = await supabase.rpc("sync_cohort_invitations", {
      p_community_id: selected.community_id,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "sync cohort invitations")
        : `${Number(data ?? 0)} new invitation${Number(data ?? 0) === 1 ? "" : "s"} sent. Existing memberships were unchanged.`,
    );
    if (!error) router.refresh();
  }

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy("save");
    setMessage("");
    const { error } = await supabase.rpc("save_cohort_configuration", {
      p_community_id: selected.community_id,
      p_eligibility_scope: form.get("eligibility_scope"),
      p_event_id: form.get("event_id") || null,
      p_follow_up_until: form.get("follow_up_until")
        ? new Date(String(form.get("follow_up_until"))).toISOString()
        : null,
      p_introduction_prompt: form.get("introduction_prompt"),
      p_status: form.get("status"),
      p_welcome_message: form.get("welcome_message"),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "save the cohort controls")
        : "Cohort boundaries and follow-up window saved.",
    );
    if (!error) router.refresh();
  }

  if (!migrationReady) {
    return (
      <section className="admin-section">
        <div className="admin-empty">
          <strong>Founding cohort controls are temporarily unavailable</strong>
          <p>
            No invitation, introduction or cohort access has been changed.
            Reload this workspace in a moment.
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      {dialog}
      <section className="cohort-admin-launch">
        <div>
          <p className="eyebrow">Founding cohort</p>
          <h1>Activate a hosted community, deliberately.</h1>
          <p>
            Eligibility, invitations, participation and private connections are
            separate decisions. This workspace shows exactly where each member
            is in that journey.
          </p>
        </div>
        <form onSubmit={(event) => void createFoundingRoom(event)}>
          <label>
            Link the founding room to an event
            <select name="event_id" required defaultValue="">
              <option value="" disabled>
                Choose an event
              </option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} · {event.status}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-primary"
            disabled={busy === "create"}
          >
            {cohorts.length
              ? "Link or refresh founding room"
              : "Prepare founding room"}
          </button>
          <small>
            This prepares a controlled private room. It does not enable member
            access, publish the community or automatically enrol anyone.
          </small>
        </form>
      </section>

      {selected ? (
        <>
          <section className="cohort-admin-summary">
            <header>
              <div>
                <p className="eyebrow">Cohort control</p>
                <h2>{selected.community_name}</h2>
                <p>
                  {selected.event_title ?? "All active members"} ·{" "}
                  {selected.cohort_status.replace("_", " ")}
                </p>
              </div>
              {cohorts.length > 1 ? (
                <label>
                  Cohort
                  <select
                    value={selected.community_id}
                    onChange={(event) =>
                      router.push(
                        `/admin/cohort?community=${event.target.value}`,
                      )
                    }
                  >
                    {cohorts.map((cohort) => (
                      <option
                        key={cohort.community_id}
                        value={cohort.community_id}
                      >
                        {cohort.community_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </header>
            <div className="cohort-admin-metrics">
              <article>
                <strong>{selected.invited_count}</strong>
                <span>Awaiting consent</span>
              </article>
              <article>
                <strong>{selected.active_count}</strong>
                <span>Room members</span>
              </article>
              <article>
                <strong>{selected.introduction_count}</strong>
                <span>Introductions</span>
              </article>
              <article>
                <strong>
                  {
                    health.filter(
                      (member) => Number(member.accepted_connections) >= 2,
                    ).length
                  }
                </strong>
                <span>Connected members</span>
              </article>
            </div>
            <button
              className="button button-primary"
              disabled={busy === "sync"}
              onClick={() => void syncInvitations()}
            >
              {busy === "sync"
                ? "Checking eligibility…"
                : "Invite eligible members"}
            </button>
          </section>

          <section className="cohort-admin-grid">
            <form onSubmit={(event) => void saveConfiguration(event)}>
              <div>
                <p className="eyebrow">Boundaries</p>
                <h2>Room controls</h2>
                <p>
                  Changing eligibility affects future invitation syncs only. It
                  never silently removes or activates an existing member.
                </p>
              </div>
              <label>
                Eligible members
                <select
                  name="eligibility_scope"
                  defaultValue={selected.eligibility_scope}
                >
                  <option value="confirmed_event">
                    Confirmed or attended event guests
                  </option>
                  <option value="active_members">
                    Every active visible member
                  </option>
                </select>
              </label>
              <label>
                Linked event
                <select name="event_id" defaultValue={selected.event_id ?? ""}>
                  <option value="">No linked event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Room status
                <select name="status" defaultValue={selected.cohort_status}>
                  <option value="draft">Draft — no invitation sync</option>
                  <option value="active">Active — participation open</option>
                  <option value="read_only">
                    Read only — preserve the private record
                  </option>
                </select>
              </label>
              <label>
                Follow-up closes
                <input
                  type="datetime-local"
                  name="follow_up_until"
                  defaultValue={
                    selected.follow_up_until
                      ? selected.follow_up_until.slice(0, 16)
                      : ""
                  }
                />
              </label>
              <label>
                Welcome message
                <textarea
                  name="welcome_message"
                  minLength={20}
                  maxLength={1200}
                  required
                  defaultValue={selected.welcome_message}
                />
              </label>
              <label>
                Guided introduction prompt
                <textarea
                  name="introduction_prompt"
                  minLength={20}
                  maxLength={800}
                  required
                  defaultValue={selected.introduction_prompt}
                />
              </label>
              <button
                className="button button-primary"
                disabled={busy === "save"}
              >
                Save cohort controls
              </button>
            </form>

            <section
              className="cohort-health"
              aria-labelledby="cohort-health-title"
            >
              <header>
                <div>
                  <p className="eyebrow">Cohort health</p>
                  <h2 id="cohort-health-title">
                    Who needs a gentle next step?
                  </h2>
                </div>
                <span>{health.length} eligible or invited</span>
              </header>
              <div>
                {health.length ? (
                  health.map((member) => (
                    <article key={member.user_id}>
                      <div>
                        <strong>{member.display_name}</strong>
                        <small>{member.email}</small>
                      </div>
                      <dl>
                        <div>
                          <dt>Profile</dt>
                          <dd>{member.profile_completion}%</dd>
                        </div>
                        <div>
                          <dt>Room</dt>
                          <dd>{member.membership_status}</dd>
                        </div>
                        <div>
                          <dt>Introduction</dt>
                          <dd>
                            {member.introduction_complete
                              ? "Shared"
                              : "Not yet"}
                          </dd>
                        </div>
                        <div>
                          <dt>Connections</dt>
                          <dd>{member.accepted_connections}</dd>
                        </div>
                        <div>
                          <dt>Event</dt>
                          <dd>{member.event_status ?? "Not confirmed"}</dd>
                        </div>
                      </dl>
                    </article>
                  ))
                ) : (
                  <div className="admin-empty">
                    <strong>No cohort members yet</strong>
                    <p>
                      Run the eligibility sync after confirming registrations.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </section>
        </>
      ) : (
        <section className="admin-empty cohort-admin-empty">
          <strong>Prepare the first hosted room</strong>
          <p>
            Choose the Nairobi event above. The room will remain empty until you
            deliberately send invitations.
          </p>
        </section>
      )}
      {message ? (
        <p className="manager-message content-manager-message" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
