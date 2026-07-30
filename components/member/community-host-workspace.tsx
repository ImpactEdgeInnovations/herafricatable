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

export function CommunityHostWorkspace({
  communityId,
  health,
  members,
  migrationReady,
  options,
}: {
  communityId: string;
  health: CommunityHostHealth | null;
  members: CommunityHostMember[];
  migrationReady: boolean;
  options: CommunityProgrammingOption[];
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
