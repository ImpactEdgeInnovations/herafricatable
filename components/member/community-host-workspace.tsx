"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunityHostHealth = {
  active_members: number;
  pending_members: number;
  posts_7d: number;
  comments_7d: number;
  unanswered_asks: number;
  open_reports: number;
  upcoming_gatherings: number;
};

export type CommunityHostMember = {
  membership_id: string;
  user_id: string;
  display_name: string;
  job_title: string | null;
  company: string | null;
  role: string;
  status: string;
  created_at: string;
};

export type CommunityContinuitySummary = {
  active_members: number;
  introduced_members: number;
  missing_introductions: number;
  participating_30d: number;
  returning_participants_30d: number;
  retention_eligible_members: number;
  retention_rate_30d: number | null;
  shared_outcomes_365d: number | null;
};

export type CommunityIntroductionFollowup = {
  user_id: string;
  display_name: string;
  job_title: string | null;
  company: string | null;
  joined_at: string;
  last_nudged_at: string | null;
  can_nudge: boolean;
};

export type CommunityOutcomeTrend = {
  outcome_type: string;
  outcome_count: number;
};

export type CommunityProgrammingOption = {
  item_type: "event" | "resource";
  item_id: string;
  slug: string;
  title: string;
  summary: string | null;
  starts_at: string | null;
  format: string | null;
  access_type: string | null;
  is_linked: boolean;
  is_featured: boolean;
};

const metrics: {
  key: keyof CommunityHostHealth;
  label: string;
  detail: string;
  attention?: boolean;
}[] = [
  {
    key: "active_members",
    label: "Active members",
    detail: "Approved people in this room",
  },
  {
    key: "pending_members",
    label: "Awaiting admission",
    detail: "Requests and invitations to review",
    attention: true,
  },
  {
    key: "posts_7d",
    label: "Conversations",
    detail: "Started in the last seven days",
  },
  {
    key: "comments_7d",
    label: "Thoughtful replies",
    detail: "Added in the last seven days",
  },
  {
    key: "unanswered_asks",
    label: "Asks needing care",
    detail: "Published Asks without a reply",
    attention: true,
  },
  {
    key: "open_reports",
    label: "Safety signals",
    detail: "Open or under review",
    attention: true,
  },
  {
    key: "upcoming_gatherings",
    label: "Upcoming gatherings",
    detail: "Linked and still ahead",
  },
];

function optionMeta(option: CommunityProgrammingOption) {
  if (option.item_type === "event" && option.starts_at) {
    return new Intl.DateTimeFormat("en-KE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(option.starts_at));
  }
  if (option.access_type === "event_bundle") return "Event-linked learning";
  if (option.access_type === "manual") return "Host-approved access";
  if (option.access_type === "purchase") return "Paid learning";
  return "Member learning";
}

function outcomeLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function CommunityHostWorkspace({
  communityId,
  continuity,
  continuityReady,
  health,
  introductionFollowups,
  members,
  migrationReady,
  options,
  outcomeTrends,
}: {
  communityId: string;
  continuity: CommunityContinuitySummary | null;
  continuityReady: boolean;
  health: CommunityHostHealth | null;
  introductionFollowups: CommunityIntroductionFollowup[];
  members: CommunityHostMember[];
  migrationReady: boolean;
  options: CommunityProgrammingOption[];
  outcomeTrends: CommunityOutcomeTrend[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("invite");
    setMessage("");
    const { error } = await supabase.rpc("invite_community_member", {
      p_community_id: communityId,
      p_email: form.get("email"),
      p_role: form.get("role"),
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "invite this member")
        : "Invitation sent. The member must accept before entering the room.",
    );
    if (!error) {
      formElement.reset();
      router.refresh();
    }
  }

  async function review(member: CommunityHostMember, action: string) {
    if (action === "remove") {
      const confirmed = await ask({
        title: `Remove ${member.display_name}?`,
        description:
          "She will lose access to this room. Her platform membership is not affected.",
        confirmLabel: "Remove from room",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    setBusy(member.membership_id);
    setMessage("");
    const { error } = await supabase.rpc("review_community_membership", {
      p_action: action,
      p_membership_id: member.membership_id,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "update this community member")
        : "Community access updated.",
    );
    if (!error) router.refresh();
  }

  async function updateProgramming(
    option: CommunityProgrammingOption,
    active: boolean,
    featured: boolean,
  ) {
    setBusy(option.item_id);
    setMessage("");
    const rpc =
      option.item_type === "event"
        ? "set_community_event_link"
        : "set_community_course_link";
    const { error } = await supabase.rpc(rpc, {
      p_active: active,
      p_community_id: communityId,
      [option.item_type === "event" ? "p_event_id" : "p_course_id"]:
        option.item_id,
      p_featured: featured,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "update this community programming")
        : active
          ? "Community programming updated."
          : "Item removed from this room.",
    );
    if (!error) router.refresh();
  }

  async function nudgeIntroduction(member: CommunityIntroductionFollowup) {
    const action = `nudge-${member.user_id}`;
    setBusy(action);
    setMessage("");
    const { error } = await supabase.rpc(
      "send_community_introduction_nudge",
      {
        p_community_id: communityId,
        p_user_id: member.user_id,
      },
    );
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "record this gentle reminder")
        : "Gentle reminder recorded. Delivery follows the member’s Activity choices.",
    );
    if (!error) router.refresh();
  }

  if (!migrationReady || !health) {
    return (
      <section className="community-host-unavailable" role="status">
        <strong>The host workspace is awaiting its database update.</strong>
        <p>
          The community room remains available. Apply the latest migration, then
          return here to manage programming and health signals.
        </p>
      </section>
    );
  }

  const pending = members.filter((member) =>
    ["requested", "invited"].includes(member.status),
  );
  const active = members.filter((member) => member.status === "active");
  const eventOptions = options.filter((option) => option.item_type === "event");
  const resourceOptions = options.filter(
    (option) => option.item_type === "resource",
  );

  return (
    <>
      <section className="community-host-health" aria-label="Community health">
        {metrics.map((metric) => (
          <article
            key={metric.key}
            className={
              metric.attention && health[metric.key] > 0 ? "needs-attention" : ""
            }
          >
            <span>{metric.label}</span>
            <strong>{health[metric.key]}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>

      {health.open_reports > 0 ? (
        <aside className="community-host-safety">
          <div>
            <strong>Platform safety review is active.</strong>
            <p>
              Report evidence stays private to the authorised moderation team.
              Contact platform support if a member needs immediate care.
            </p>
          </div>
          <a className="button button-outline" href="/support">
            Contact platform safety
          </a>
        </aside>
      ) : null}

      {message ? (
        <p className="community-host-message" role="status">
          {message}
        </p>
      ) : null}

      <section
        className="community-host-panel community-host-continuity"
        id="continuity"
      >
        <header>
          <div>
            <p className="eyebrow">Continuity</p>
            <h2>Help the room keep its promise.</h2>
          </div>
          <p>
            These are shared room signals, not member scores. Use them to make
            introductions easier, notice whether participation is returning,
            and protect the privacy of relationship outcomes.
          </p>
        </header>
        {continuityReady && continuity ? (
          <>
            <div
              className="community-continuity-metrics"
              aria-label="Community continuity signals"
            >
              <article>
                <span>Introductions complete</span>
                <strong>
                  {continuity.introduced_members}
                  <small> / {continuity.active_members}</small>
                </strong>
                <p>A clear first step into the room</p>
              </article>
              <article>
                <span>Participating this month</span>
                <strong>{continuity.participating_30d}</strong>
                <p>Members who contributed in the last 30 days</p>
              </article>
              <article>
                <span>Returning participants</span>
                <strong>{continuity.returning_participants_30d}</strong>
                <p>Established members who participated this month</p>
              </article>
              <article>
                <span>30-day continuity</span>
                <strong>
                  {continuity.retention_rate_30d === null
                    ? "Building baseline"
                    : `${continuity.retention_rate_30d}%`}
                </strong>
                <p>
                  Shown only when at least five established members are
                  eligible
                </p>
              </article>
            </div>

            <div className="community-continuity-columns">
              <section aria-labelledby="introduction-followups-title">
                <div className="community-continuity-subhead">
                  <div>
                    <p className="eyebrow">A gentle first step</p>
                    <h3 id="introduction-followups-title">
                      {continuity.missing_introductions
                        ? `${continuity.missing_introductions} introductions to welcome`
                        : "Every active member has introduced herself"}
                    </h3>
                  </div>
                  <span>One reminder per week</span>
                </div>
                {introductionFollowups.length ? (
                  <div className="community-introduction-followups">
                    {introductionFollowups.map((member) => (
                      <article key={member.user_id}>
                        <div>
                          <strong>{member.display_name}</strong>
                          <span>
                            {[member.job_title, member.company]
                              .filter(Boolean)
                              .join(" · ") || "Community member"}
                          </span>
                        </div>
                        {member.can_nudge ? (
                          <button
                            type="button"
                            disabled={busy === `nudge-${member.user_id}`}
                            onClick={() => void nudgeIntroduction(member)}
                          >
                            {busy === `nudge-${member.user_id}`
                              ? "Recording…"
                              : "Send gentle reminder"}
                          </button>
                        ) : (
                          <small>Reminder recorded recently</small>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="community-host-empty">
                    There is no introduction follow-up needed today.
                  </p>
                )}
                <p className="community-continuity-note">
                  Reminders are in-app only, respect the member’s global
                  Activity preference, and never expose private contact details.
                </p>
              </section>

              <section aria-labelledby="outcome-trends-title">
                <div className="community-continuity-subhead">
                  <div>
                    <p className="eyebrow">What the room enabled</p>
                    <h3 id="outcome-trends-title">Shared outcomes</h3>
                  </div>
                  <strong>
                    {continuity.shared_outcomes_365d ?? "Private"}
                  </strong>
                </div>
                {outcomeTrends.length ? (
                  <div className="community-outcome-trends">
                    {outcomeTrends.map((outcome) => (
                      <div key={outcome.outcome_type}>
                        <span>{outcomeLabel(outcome.outcome_type)}</span>
                        <strong>{outcome.outcome_count}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="community-host-empty">
                    Outcome trends stay private until at least three different
                    members anonymously share the same outcome type.
                  </p>
                )}
                <p className="community-continuity-note">
                  Hosts see category totals only—never names, relationship
                  details, or an individual member’s history.
                </p>
              </section>
            </div>
          </>
        ) : (
          <div className="community-continuity-awaiting" role="status">
            <strong>Continuity signals are awaiting their database update.</strong>
            <p>
              Admissions, people and programming remain available below. Apply
              the latest continuity migration to add this private Host view.
            </p>
          </div>
        )}
      </section>

      <section className="community-host-panel" id="admissions">
        <header>
          <div>
            <p className="eyebrow">Admissions</p>
            <h2>Know who enters the room.</h2>
          </div>
          <p>
            Community admission is separate from platform approval. Invite only
            active members whose participation fits this room.
          </p>
        </header>
        <form className="community-host-invite" onSubmit={(event) => void invite(event)}>
          <label>
            Active member email
            <input name="email" type="email" required />
          </label>
          <label>
            Room role
            <select name="role" defaultValue="member">
              <option value="member">Member</option>
              <option value="moderator">Moderator</option>
            </select>
          </label>
          <button className="button button-primary" disabled={busy === "invite"}>
            {busy === "invite" ? "Sending…" : "Send invitation"}
          </button>
        </form>
        <div className="community-host-member-list">
          <h3>{pending.length ? "Needs attention" : "No admission decisions waiting"}</h3>
          {pending.map((member) => (
            <article key={member.membership_id}>
              <div>
                <strong>{member.display_name}</strong>
                <span>
                  {[member.job_title, member.company].filter(Boolean).join(" · ") ||
                    "Member profile"}
                </span>
                <small>{member.status === "requested" ? "Requested access" : "Invitation awaiting response"}</small>
              </div>
              {member.status === "requested" ? (
                <div>
                  <button
                    disabled={busy === member.membership_id}
                    onClick={() => void review(member, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy === member.membership_id}
                    onClick={() => void review(member, "decline")}
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="community-host-panel" id="people">
        <header>
          <div>
            <p className="eyebrow">People</p>
            <h2>Steward roles with care.</h2>
          </div>
          <p>
            Moderators can manage members and conversations. Removing someone
            here does not change her wider Her Africa Table membership.
          </p>
        </header>
        <div className="community-host-member-list">
          {active.map((member) => (
            <article key={member.membership_id}>
              <div>
                <strong>{member.display_name}</strong>
                <span>
                  {[member.job_title, member.company].filter(Boolean).join(" · ") ||
                    "Member profile"}
                </span>
                <small>{member.role}</small>
              </div>
              {member.role !== "owner" ? (
                <div>
                  <button
                    disabled={busy === member.membership_id}
                    onClick={() =>
                      void review(
                        member,
                        member.role === "moderator" ? "demote" : "promote",
                      )
                    }
                  >
                    {member.role === "moderator" ? "Make member" : "Make moderator"}
                  </button>
                  <button
                    className="danger-action"
                    disabled={busy === member.membership_id}
                    onClick={() => void review(member, "remove")}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="community-owner-label">Room owner</span>
              )}
            </article>
          ))}
        </div>
      </section>

      <ProgrammingPanel
        busy={busy}
        eyebrow="Gatherings"
        empty="Publish an event in Admin before linking it to this room."
        options={eventOptions}
        title="Choose where this community meets."
        onUpdate={updateProgramming}
      />
      <ProgrammingPanel
        busy={busy}
        eyebrow="Resources"
        empty="Publish a course in Admin before adding it to this room."
        options={resourceOptions}
        title="Keep the shelf small and useful."
        onUpdate={updateProgramming}
      />
      {dialog}
    </>
  );
}

function ProgrammingPanel({
  busy,
  empty,
  eyebrow,
  onUpdate,
  options,
  title,
}: {
  busy: string;
  empty: string;
  eyebrow: string;
  onUpdate: (
    option: CommunityProgrammingOption,
    active: boolean,
    featured: boolean,
  ) => Promise<void>;
  options: CommunityProgrammingOption[];
  title: string;
}) {
  return (
    <section
      className="community-host-panel community-host-programming"
      id={eyebrow.toLowerCase()}
    >
      <header>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <p>
          Linked items appear inside the member room. A host pick is placed
          first, but members still choose whether to participate.
        </p>
      </header>
      {options.length ? (
        <div>
          {options.map((option) => (
            <article key={option.item_id}>
              <div>
                <span>{optionMeta(option)}</span>
                <strong>{option.title}</strong>
                <p>{option.summary || "Details will be shared shortly."}</p>
              </div>
              <div>
                {option.is_linked ? (
                  <>
                    <button
                      disabled={busy === option.item_id}
                      onClick={() =>
                        void onUpdate(option, true, !option.is_featured)
                      }
                    >
                      {option.is_featured ? "Remove host pick" : "Make host pick"}
                    </button>
                    <button
                      className="danger-action"
                      disabled={busy === option.item_id}
                      onClick={() => void onUpdate(option, false, false)}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    disabled={busy === option.item_id}
                    onClick={() => void onUpdate(option, true, false)}
                  >
                    Add to room
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="community-host-empty">{empty}</p>
      )}
    </section>
  );
}
