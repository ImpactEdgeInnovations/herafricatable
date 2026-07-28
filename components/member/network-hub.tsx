"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";

export type DirectoryMember = {
  avatar_url: string | null;
  bio: string | null;
  business_name: string | null;
  city: string | null;
  company: string | null;
  connection_status: string | null;
  country: string | null;
  display_name: string | null;
  goals: string[];
  industry: string | null;
  interests: string[];
  job_title: string | null;
  languages: string[];
  user_id: string;
  website_url: string | null;
};
export type NetworkConnection = {
  avatar_url: string | null;
  city: string | null;
  company: string | null;
  connection_id: string;
  country: string | null;
  direction: "incoming" | "outgoing";
  display_name: string | null;
  job_title: string | null;
  introduction_note: string | null;
  other_user_id: string;
  status: "pending" | "accepted";
  updated_at: string;
};
export type ConnectionContact = {
  instagram_url: string | null;
  linkedin_url: string | null;
  phone: string | null;
  user_id: string;
  whatsapp_number: string | null;
};
export type BlockedMember = {
  blocked_at: string;
  display_name: string | null;
  user_id: string;
};
export type SavedMemberProfile = {
  avatar_url: string | null;
  city: string | null;
  company: string | null;
  connection_status: string | null;
  country: string | null;
  display_name: string | null;
  job_title: string | null;
  private_note: string | null;
  saved_at: string;
  user_id: string;
};
export type SuggestedMember = {
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  company: string | null;
  country: string | null;
  display_name: string | null;
  industry: string | null;
  job_title: string | null;
  match_reasons: string[];
  match_score: number;
  shared_goals: string[];
  shared_interests: string[];
  user_id: string;
};
export type CuratedIntroduction = {
  avatar_url: string | null;
  city: string | null;
  company: string | null;
  country: string | null;
  created_at: string;
  display_name: string | null;
  introduction_id: string;
  job_title: string | null;
  my_decision: "pending" | "accepted" | "declined";
  other_user_id: string;
  reason: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  updated_at: string;
};
export type ConnectionAvailability = {
  request_mode: "open" | "curated_only" | "paused";
  user_id: string;
};
export type ConnectionFollowup = {
  avatar_url: string | null;
  company: string | null;
  connection_id: string;
  display_name: string | null;
  is_due: boolean;
  job_title: string | null;
  last_completed_at: string | null;
  next_step: string | null;
  other_user_id: string;
  private_note: string | null;
  remind_on: string | null;
  updated_at: string;
};
export type ConnectionOutcome = {
  company: string | null;
  connection_id: string;
  created_at: string;
  display_name: string | null;
  occurred_on: string;
  other_user_id: string;
  outcome_id: string;
  outcome_type:
    | "collaboration"
    | "referral"
    | "mentorship"
    | "client"
    | "investment"
    | "friendship"
    | "knowledge"
    | "other";
  private_detail: string;
  share_anonymously: boolean;
};

const goalLabels: Record<string, string> = {
  be_mentored: "Find a mentor",
  build_business: "Build a business",
  find_clients: "Find clients or collaborators",
  invest: "Invest or find investment",
  learn: "Learn and grow",
  make_friends: "Build meaningful friendships",
  mentor: "Mentor other women",
  shop_african_brands: "Discover African brands",
  travel: "Connect through travel",
};
const outcomeLabels: Record<ConnectionOutcome["outcome_type"], string> = {
  client: "Client conversation",
  collaboration: "Collaboration",
  friendship: "Friendship",
  investment: "Investment conversation",
  knowledge: "Knowledge shared",
  mentorship: "Mentorship",
  other: "Another meaningful outcome",
  referral: "Referral or introduction",
};

export function NetworkHub({
  members,
  connections,
  connectionCode,
  contacts,
  blockedMembers,
  savedMembers,
  suggestedMembers,
  curatedIntroductions,
  connectionAvailability,
  followups,
  outcomes,
  cityFilter,
  goalFilter,
  searchQuery,
}: {
  members: DirectoryMember[];
  connections: NetworkConnection[];
  connectionCode: string;
  contacts: ConnectionContact[];
  blockedMembers: BlockedMember[];
  savedMembers: SavedMemberProfile[];
  suggestedMembers: SuggestedMember[];
  curatedIntroductions: CuratedIntroduction[];
  connectionAvailability: ConnectionAvailability[];
  followups: ConnectionFollowup[];
  outcomes: ConnectionOutcome[];
  cityFilter: string;
  goalFilter: string;
  searchQuery: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const { ask, dialog } = useActionDialog();
  const connectionModeFor = (memberId: string) =>
    connectionAvailability.find((item) => item.user_id === memberId)
      ?.request_mode ?? "open";
  async function request(
    memberId: string | null,
    connectionCode: string | null,
  ) {
    const result = await ask({
      title: "Add context to your introduction",
      description:
        "A short note helps her decide whether this connection feels relevant. It is visible only to the two of you.",
      confirmLabel: "Send request",
      fields: [
        {
          name: "note",
          label: "Why would you like to connect? (optional)",
          type: "textarea",
          minLength: 10,
          maxLength: 500,
          placeholder:
            "For example: I would value comparing notes on growing a women-led logistics business in Nairobi.",
        },
      ],
    });
    if (!result) return;
    setBusy(memberId ?? connectionCode ?? "code");
    setMessage("");
    const { error } = await supabase.rpc("request_connection_with_context", {
      p_connection_code: connectionCode,
      p_introduction_note: String(result.note ?? ""),
      p_member_id: memberId,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "send this connection request")
        : "Connection request sent.",
    );
    if (!error) router.refresh();
  }
  async function respond(id: string, action: "accept" | "ignore") {
    setBusy(id);
    const { error } = await supabase.rpc("respond_to_connection", {
      p_action: action,
      p_connection_id: id,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, `${action} this connection request`)
        : `Request ${action}ed.`,
    );
    if (!error) router.refresh();
  }
  async function respondToCuratedIntroduction(
    introductionId: string,
    action: "accept" | "decline",
  ) {
    if (action === "decline") {
      const result = await ask({
        title: "Decline this introduction?",
        description:
          "No contact details will be shared. The other member will only see that the introduction is not moving forward.",
        confirmLabel: "Decline privately",
        tone: "danger",
      });
      if (!result) return;
    }
    setBusy(`curated:${introductionId}`);
    setMessage("");
    const { data, error } = await supabase.rpc(
      "respond_to_curated_introduction",
      {
        p_action: action,
        p_introduction_id: introductionId,
      },
    );
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, `${action} this introduction`)
        : data === "accepted"
          ? "You both accepted. Your connection and private messaging are ready."
          : action === "accept"
            ? "Accepted privately. We will let you know if she also accepts."
            : "Introduction declined privately.",
    );
    if (!error) router.refresh();
  }
  async function saveProfile(memberId: string, displayName: string) {
    const result = await ask({
      title: `Save ${displayName} for later?`,
      description:
        "This is private. She will not be notified, and saving does not send a connection request.",
      confirmLabel: "Save profile",
      fields: [
        {
          name: "note",
          label: "Private reminder (optional)",
          type: "textarea",
          minLength: 3,
          maxLength: 500,
          placeholder:
            "For example: Revisit before the Nairobi event to discuss regional distribution.",
        },
      ],
    });
    if (!result) return;
    setBusy(`save:${memberId}`);
    setMessage("");
    const { error } = await supabase.rpc("save_member_profile", {
      p_member_id: memberId,
      p_private_note: String(result.note ?? ""),
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "save this profile")
        : "Profile saved privately for later.",
    );
    if (!error) router.refresh();
  }
  async function removeSavedProfile(memberId: string) {
    setBusy(`save:${memberId}`);
    setMessage("");
    const { error } = await supabase.rpc("remove_saved_member_profile", {
      p_member_id: memberId,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "remove this saved profile")
        : "Profile removed from your saved list.",
    );
    if (!error) router.refresh();
  }
  async function startMessage(connectionId: string) {
    setBusy(connectionId);
    const { data, error } = await supabase.rpc("ensure_conversation", {
      p_connection_id: connectionId,
    });
    setBusy("");
    if (error) {
      setMessage(memberErrorMessage(error, "open this conversation"));
      return;
    }
    window.location.assign(`/messages?conversation=${data}`);
  }
  async function planFollowup(
    connectionId: string,
    displayName: string,
  ) {
    const existing = followups.find(
      (item) => item.connection_id === connectionId,
    );
    const result = await ask({
      title: `Plan your follow-up with ${displayName}`,
      description:
        "This note and reminder are private to you. The member and Admin cannot see them.",
      confirmLabel: existing ? "Update private plan" : "Save private plan",
      fields: [
        {
          initialValue: existing?.private_note ?? "",
          maxLength: 1000,
          minLength: 3,
          name: "note",
          label: "Private note (optional)",
          placeholder:
            "For example: Interested in regional distribution and values careful partnerships.",
          type: "textarea",
        },
        {
          initialValue: existing?.next_step ?? "",
          maxLength: 300,
          minLength: 3,
          name: "nextStep",
          label: "Your next step (optional)",
          placeholder: "Send the supplier introduction we discussed.",
          type: "textarea",
        },
        {
          initialValue: existing?.remind_on ?? "",
          name: "remindOn",
          label: "Remind me on (optional)",
          type: "date",
        },
      ],
    });
    if (!result) return;
    setBusy(`followup:${connectionId}`);
    setMessage("");
    const { error } = await supabase.rpc("save_connection_followup", {
      p_connection_id: connectionId,
      p_next_step: String(result.nextStep ?? ""),
      p_private_note: String(result.note ?? ""),
      p_remind_on: String(result.remindOn ?? "") || null,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "save this private follow-up")
        : "Your private follow-up plan is saved.",
    );
    if (!error) router.refresh();
  }
  async function completeFollowup(connectionId: string) {
    setBusy(`followup:${connectionId}`);
    setMessage("");
    const { error } = await supabase.rpc("complete_connection_followup", {
      p_connection_id: connectionId,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "complete this follow-up")
        : "Follow-up marked complete.",
    );
    if (!error) router.refresh();
  }
  async function removeFollowup(connectionId: string) {
    const result = await ask({
      title: "Remove this private plan?",
      description:
        "Your personal note, next step and reminder will be deleted. The connection itself is unchanged.",
      confirmLabel: "Remove private plan",
      tone: "danger",
    });
    if (!result) return;
    setBusy(`followup:${connectionId}`);
    setMessage("");
    const { error } = await supabase.rpc("remove_connection_followup", {
      p_connection_id: connectionId,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "remove this private follow-up")
        : "Private follow-up plan removed.",
    );
    if (!error) router.refresh();
  }
  async function recordOutcome(
    connectionId: string,
    displayName: string,
    existing?: ConnectionOutcome,
  ) {
    const result = await ask({
      title: existing
        ? `Update your outcome with ${displayName}`
        : `What came from connecting with ${displayName}?`,
      description:
        "Your note and both members’ identities always stay private. You can change or withdraw anonymous sharing at any time.",
      confirmLabel: existing ? "Update outcome" : "Save outcome",
      fields: [
        {
          initialValue: existing?.outcome_type ?? "collaboration",
          label: "Type of outcome",
          name: "outcomeType",
          options: Object.entries(outcomeLabels).map(([value, label]) => ({
            label,
            value,
          })),
          type: "select",
        },
        {
          initialValue:
            existing?.occurred_on ?? new Date().toISOString().slice(0, 10),
          label: "When did it happen?",
          name: "occurredOn",
          required: true,
          type: "date",
        },
        {
          help: "This is visible only to you—not the other member or Admin.",
          initialValue: existing?.private_detail ?? "",
          label: "Private detail",
          maxLength: 2000,
          minLength: 10,
          name: "detail",
          placeholder:
            "For example: We agreed to test a joint supplier programme in Nairobi.",
          required: true,
          type: "textarea",
        },
        {
          help: "Admin receives only an anonymous category total—never your note, name, or the other member’s identity. The category stays hidden until at least three different real members contribute.",
          initialValue: existing?.share_anonymously ?? true,
          label: "Include this in anonymous community totals",
          name: "shareAnonymously",
          type: "checkbox",
        },
      ],
    });
    if (!result) return;
    setBusy(`outcome:${connectionId}`);
    setMessage("");
    const payload = {
      p_occurred_on: String(result.occurredOn),
      p_outcome_type: String(result.outcomeType),
      p_private_detail: String(result.detail),
      p_share_anonymously: Boolean(result.shareAnonymously),
    };
    const { error } = existing
      ? await supabase.rpc("update_connection_outcome", {
          ...payload,
          p_outcome_id: existing.outcome_id,
        })
      : await supabase.rpc("record_connection_outcome", {
          ...payload,
          p_connection_id: connectionId,
        });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "record this connection outcome")
        : existing
          ? "Your outcome and sharing choice have been updated."
          : "Your private outcome has been recorded.",
    );
    if (!error) router.refresh();
  }
  async function removeOutcome(outcomeId: string) {
    const result = await ask({
      title: "Delete this private outcome?",
      description:
        "The private note and its anonymous contribution will be removed. Your connection is unchanged.",
      confirmLabel: "Delete outcome",
      tone: "danger",
    });
    if (!result) return;
    setBusy(`outcome:${outcomeId}`);
    setMessage("");
    const { error } = await supabase.rpc("remove_connection_outcome", {
      p_outcome_id: outcomeId,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "delete this connection outcome")
        : "Private outcome deleted.",
    );
    if (!error) router.refresh();
  }
  async function safety(
    memberId: string,
    action: "remove" | "block" | "unblock" | "report",
    connectionId?: string,
  ) {
    let error: { message: string } | null = null;
    setBusy(memberId);
    if (action === "remove") {
      const result = await ask({
        title: "Remove this connection?",
        description:
          "Private contact access will end for both members. You can send a new connection request later.",
        confirmLabel: "Remove connection",
        tone: "danger",
      });
      if (!result) {
        setBusy("");
        return;
      }
      ({ error } = await supabase.rpc("remove_connection", {
        p_connection_id: connectionId,
      }));
    } else if (action === "block") {
      const result = await ask({
        title: "Block this member?",
        description:
          "They will no longer be able to find, connect with, or message you. Your reason stays private.",
        confirmLabel: "Block member",
        tone: "danger",
        fields: [
          {
            name: "reason",
            label: "Private reason (optional)",
            type: "textarea",
            maxLength: 1000,
          },
        ],
      });
      if (!result) {
        setBusy("");
        return;
      }
      const reason = String(result.reason);
      ({ error } = await supabase.rpc("block_member", {
        p_member_id: memberId,
        p_reason: reason,
      }));
    } else if (action === "unblock") {
      ({ error } = await supabase.rpc("unblock_member", {
        p_member_id: memberId,
      }));
    } else {
      const result = await ask({
        title: "Report this member privately",
        description:
          "Choose the concern and add enough context for the moderation team to review it safely.",
        confirmLabel: "Submit report",
        tone: "danger",
        fields: [
          {
            name: "category",
            label: "Reason",
            type: "select",
            initialValue: "safety",
            options: [
              { value: "harassment", label: "Harassment" },
              { value: "spam", label: "Spam" },
              { value: "misrepresentation", label: "Misrepresentation" },
              { value: "privacy", label: "Privacy" },
              { value: "safety", label: "Safety" },
              { value: "other", label: "Other" },
            ],
          },
          {
            name: "details",
            label: "What happened?",
            type: "textarea",
            required: true,
            minLength: 10,
            maxLength: 2000,
          },
        ],
      });
      if (!result) {
        setBusy("");
        return;
      }
      const category = String(result.category);
      const details = String(result.details);
      ({ error } = await supabase.rpc("report_member", {
        p_category: category,
        p_details: details,
        p_member_id: memberId,
      }));
    }
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, `${action} this member`)
        : action === "report"
          ? "Report submitted privately to the moderation team."
          : `Member ${action}ed.`,
    );
    if (!error) router.refresh();
  }
  function submitCode(e: FormEvent) {
    e.preventDefault();
    if (code.trim()) void request(null, code.trim());
  }
  return (
    <>
      {dialog}
      {connections.length ? (
        <section className="network-connections">
          <div>
            <p className="eyebrow">Your network</p>
            <h2>Connections and requests</h2>
          </div>
          <div>
            {connections.map((item) => {
              const contact = contacts.find(
                (x) => x.user_id === item.other_user_id,
              );
              const followup = followups.find(
                (x) => x.connection_id === item.connection_id,
              );
              const connectionOutcomes = outcomes.filter(
                (x) => x.connection_id === item.connection_id,
              );
              return (
                <article key={item.connection_id}>
                  <span className="network-avatar">
                    {item.avatar_url ? (
                      <img src={item.avatar_url} alt="" />
                    ) : (
                      (item.display_name?.[0] ?? "H")
                    )}
                  </span>
                  <div>
                    <Link
                      className="network-profile-link"
                      href={`/members/${item.other_user_id}`}
                    >
                      {item.display_name}
                    </Link>
                    <small>
                      {[item.job_title, item.company, item.city]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    {item.introduction_note ? (
                      <blockquote className="network-introduction-note">
                        <span>
                          {item.direction === "incoming"
                            ? "Why she would like to connect"
                            : "Your introduction"}
                        </span>
                        {item.introduction_note}
                      </blockquote>
                    ) : null}
                    {item.status === "accepted" && contact ? (
                      <p>
                        {contact.linkedin_url ? (
                          <a
                            href={contact.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            LinkedIn
                          </a>
                        ) : null}
                        {contact.instagram_url ? (
                          <a
                            href={contact.instagram_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Instagram
                          </a>
                        ) : null}
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                        ) : null}
                        {contact.whatsapp_number ? (
                          <a
                            href={`https://wa.me/${contact.whatsapp_number.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                      </p>
                    ) : null}
                    {item.status === "accepted" && followup ? (
                      <div
                        className={`connection-followup${followup.is_due ? " is-due" : ""}`}
                      >
                        <span>
                          {followup.is_due
                            ? "Follow-up due"
                            : "Your private plan"}
                        </span>
                        {followup.next_step ? (
                          <strong>{followup.next_step}</strong>
                        ) : null}
                        {followup.private_note ? (
                          <p>{followup.private_note}</p>
                        ) : null}
                        {followup.remind_on ? (
                          <small>
                            {new Intl.DateTimeFormat("en-KE", {
                              dateStyle: "medium",
                            }).format(new Date(`${followup.remind_on}T12:00:00`))}
                          </small>
                        ) : null}
                      </div>
                    ) : null}
                    {item.status === "accepted" &&
                    connectionOutcomes.length ? (
                      <div className="connection-outcomes">
                        <span>What this connection led to</span>
                        {connectionOutcomes.map((outcome) => (
                          <div
                            className="connection-outcome"
                            key={outcome.outcome_id}
                          >
                            <div>
                              <strong>
                                {outcomeLabels[outcome.outcome_type]}
                              </strong>
                              <small>
                                {new Intl.DateTimeFormat("en-KE", {
                                  dateStyle: "medium",
                                }).format(
                                  new Date(`${outcome.occurred_on}T12:00:00`),
                                )}
                                {" · "}
                                {outcome.share_anonymously
                                  ? "Eligible for anonymous totals"
                                  : "Completely private"}
                              </small>
                              <p>{outcome.private_detail}</p>
                            </div>
                            <span className="connection-outcome-actions">
                              <button
                                aria-label={`Edit ${outcomeLabels[outcome.outcome_type].toLowerCase()} outcome`}
                                disabled={busy !== ""}
                                onClick={() =>
                                  void recordOutcome(
                                    item.connection_id,
                                    item.display_name || "this member",
                                    outcome,
                                  )
                                }
                              >
                                Edit
                              </button>
                              <button
                                aria-label={`Delete ${outcomeLabels[outcome.outcome_type].toLowerCase()} outcome`}
                                disabled={busy !== ""}
                                onClick={() =>
                                  void removeOutcome(outcome.outcome_id)
                                }
                              >
                                Delete
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <span className="member-status">
                    {item.status}
                    {item.status === "pending" ? ` · ${item.direction}` : ""}
                  </span>
                  {item.status === "pending" &&
                  item.direction === "incoming" ? (
                    <div className="member-actions">
                      <button
                        disabled={busy === item.connection_id}
                        onClick={() =>
                          void respond(item.connection_id, "accept")
                        }
                      >
                        Accept
                      </button>
                      <button
                        disabled={busy === item.connection_id}
                        onClick={() =>
                          void respond(item.connection_id, "ignore")
                        }
                      >
                        Ignore
                      </button>
                    </div>
                  ) : item.status === "accepted" ? (
                    <div className="member-actions network-safety-actions">
                      <button
                        disabled={busy !== ""}
                        onClick={() => void startMessage(item.connection_id)}
                      >
                        Message
                      </button>
                      <button
                        disabled={busy !== ""}
                        onClick={() =>
                          void safety(
                            item.other_user_id,
                            "remove",
                            item.connection_id,
                          )
                        }
                      >
                        Remove
                      </button>
                      <button
                        disabled={busy !== ""}
                        onClick={() =>
                          void planFollowup(
                            item.connection_id,
                            item.display_name || "this member",
                          )
                        }
                      >
                        {followup ? "Edit follow-up" : "Plan follow-up"}
                      </button>
                      <button
                        disabled={busy !== ""}
                        onClick={() =>
                          void recordOutcome(
                            item.connection_id,
                            item.display_name || "this member",
                          )
                        }
                      >
                        Record outcome
                      </button>
                      {followup?.next_step ? (
                        <button
                          disabled={busy !== ""}
                          onClick={() =>
                            void completeFollowup(item.connection_id)
                          }
                        >
                          Mark done
                        </button>
                      ) : null}
                      {followup ? (
                        <button
                          disabled={busy !== ""}
                          onClick={() =>
                            void removeFollowup(item.connection_id)
                          }
                        >
                          Clear plan
                        </button>
                      ) : null}
                      <button
                        disabled={busy !== ""}
                        onClick={() =>
                          void safety(item.other_user_id, "report")
                        }
                      >
                        Report
                      </button>
                      <button
                        className="danger-action"
                        disabled={busy !== ""}
                        onClick={() => void safety(item.other_user_id, "block")}
                      >
                        Block
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {curatedIntroductions.some((item) => item.status === "pending") ? (
        <section
          className="curated-introductions"
          id="curated-introductions"
        >
          <header>
            <p className="eyebrow">Introduced by Her Africa Table</p>
            <h2>A thoughtful person to meet</h2>
            <p>
              Both of you decide independently. Contact details and messaging
              remain private until you both accept.
            </p>
          </header>
          <div>
            {curatedIntroductions
              .filter((item) => item.status === "pending")
              .map((item) => (
                <article key={item.introduction_id}>
                  <span className="directory-avatar">
                    {item.avatar_url ? (
                      <img src={item.avatar_url} alt="" />
                    ) : (
                      (item.display_name?.[0] ?? "H")
                    )}
                  </span>
                  <div>
                    <p className="eyebrow">
                      {[item.city, item.country].filter(Boolean).join(", ")}
                    </p>
                    <h3>
                      <Link href={`/members/${item.other_user_id}`}>
                        {item.display_name}
                      </Link>
                    </h3>
                    <strong>
                      {[item.job_title, item.company]
                        .filter(Boolean)
                        .join(" · ")}
                    </strong>
                    <blockquote>
                      <span>Why we thought of you both</span>
                      {item.reason}
                    </blockquote>
                  </div>
                  {item.my_decision === "accepted" ? (
                    <span className="curated-waiting">
                      You accepted · waiting privately
                    </span>
                  ) : (
                    <div className="curated-introduction-actions">
                      <button
                        disabled={busy !== ""}
                        onClick={() =>
                          void respondToCuratedIntroduction(
                            item.introduction_id,
                            "accept",
                          )
                        }
                      >
                        I would like to meet
                      </button>
                      <button
                        disabled={busy !== ""}
                        onClick={() =>
                          void respondToCuratedIntroduction(
                            item.introduction_id,
                            "decline",
                          )
                        }
                      >
                        Not this time
                      </button>
                    </div>
                  )}
                </article>
              ))}
          </div>
        </section>
      ) : null}
      {savedMembers.length ? (
        <section className="saved-member-profiles">
          <header>
            <div>
              <p className="eyebrow">Private to you</p>
              <h2>Saved for later</h2>
            </div>
            <span>{savedMembers.length} saved</span>
          </header>
          <div>
            {savedMembers.map((member) => (
              <article key={member.user_id}>
                <span className="network-avatar">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" />
                  ) : (
                    (member.display_name?.[0] ?? "H")
                  )}
                </span>
                <div>
                  <Link href={`/members/${member.user_id}`}>
                    {member.display_name}
                  </Link>
                  <small>
                    {[member.job_title, member.company, member.city]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {member.private_note ? <p>{member.private_note}</p> : null}
                </div>
                <button
                  disabled={busy !== ""}
                  onClick={() => void removeSavedProfile(member.user_id)}
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {suggestedMembers.length ? (
        <section className="member-suggestions">
          <header>
            <div>
              <p className="eyebrow">A thoughtful starting point</p>
              <h2>People you may want to meet</h2>
              <p>
                Suggestions use the goals and professional details members
                choose to share. They are not endorsements or popularity
                rankings.
              </p>
            </div>
          </header>
          <div>
            {suggestedMembers.map((member) => (
              <article key={member.user_id}>
                <span className="directory-avatar">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" />
                  ) : (
                    (member.display_name?.[0] ?? "H")
                  )}
                </span>
                <div>
                  <p className="eyebrow">
                    {[member.city, member.country].filter(Boolean).join(", ")}
                  </p>
                  <h3>
                    <Link href={`/members/${member.user_id}`}>
                      {member.display_name}
                    </Link>
                  </h3>
                  <strong>
                    {[member.job_title, member.company]
                      .filter(Boolean)
                      .join(" · ")}
                  </strong>
                </div>
                <div className="suggestion-reasons">
                  <small>Why this suggestion</small>
                  {member.match_reasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
                <div className="suggestion-actions">
                  <button
                    disabled={
                      busy !== "" ||
                      connectionModeFor(member.user_id) !== "open"
                    }
                    onClick={() => void request(member.user_id, null)}
                  >
                    {connectionModeFor(member.user_id) === "open"
                      ? "Request introduction"
                      : connectionModeFor(member.user_id) === "curated_only"
                        ? "Curated introductions only"
                        : "Not accepting requests"}
                  </button>
                  <button
                    disabled={busy !== ""}
                    onClick={() =>
                      void saveProfile(
                        member.user_id,
                        member.display_name || "this member",
                      )
                    }
                  >
                    Save for later
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="member-directory">
        <header>
          <div>
            <p className="eyebrow">Discover members</p>
            <h2>Find someone to connect with.</h2>
            <p>
              Search by name, role, company, industry, or city.
            </p>
          </div>
          <form className="directory-filters" method="get">
            <label>
              <span>Search</span>
              <input
                defaultValue={searchQuery}
                id="member-search"
                name="q"
                placeholder="Role, company or industry"
              />
            </label>
            <label>
              <span>City</span>
              <input
                defaultValue={cityFilter}
                name="city"
                placeholder="For example, Nairobi"
              />
            </label>
            <label>
              <span>Current goal</span>
              <select defaultValue={goalFilter} name="goal">
                <option value="">Any goal</option>
                {Object.entries(goalLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button type="submit">Find members</button>
              {searchQuery || cityFilter || goalFilter ? (
                <a href="/network">Clear</a>
              ) : null}
            </div>
          </form>
        </header>
        {members.length ? (
          <div className="directory-grid">
            {members.map((member) => (
              <article key={member.user_id}>
                <span className="directory-avatar">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" />
                  ) : (
                    (member.display_name?.[0] ?? "H")
                  )}
                </span>
                <div>
                  <p className="eyebrow">
                    {[member.city, member.country].filter(Boolean).join(", ")}
                  </p>
                  <h3>
                    <Link href={`/members/${member.user_id}`}>
                      {member.display_name}
                    </Link>
                  </h3>
                  <strong>
                    {[member.job_title, member.company]
                      .filter(Boolean)
                      .join(" · ")}
                  </strong>
                  <p>{member.bio}</p>
                  {member.goals.length ? (
                    <div className="directory-intent">
                      <small>Here for</small>
                      <strong>
                        {member.goals
                          .slice(0, 2)
                          .map((goal) => goalLabels[goal] ?? goal)
                          .join(" · ")}
                      </strong>
                    </div>
                  ) : null}
                  {member.interests.length ? (
                    <div className="directory-tags">
                      {member.interests.slice(0, 3).map((x) => (
                        <span key={x}>{x}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Link
                  className="directory-profile-link"
                  href={`/members/${member.user_id}`}
                >
                  View full profile
                </Link>
                <div className="directory-card-actions">
                  <button
                    disabled={
                      busy !== "" ||
                      member.connection_status === "pending" ||
                      member.connection_status === "accepted" ||
                      connectionModeFor(member.user_id) !== "open"
                    }
                    onClick={() => void request(member.user_id, null)}
                  >
                    {member.connection_status === "accepted"
                      ? "Connected"
                      : member.connection_status === "pending"
                        ? "Request pending"
                        : connectionModeFor(member.user_id) === "open"
                          ? "Request introduction"
                          : connectionModeFor(member.user_id) ===
                              "curated_only"
                            ? "Curated introductions only"
                            : "Not accepting requests"}
                  </button>
                  {savedMembers.some(
                    (saved) => saved.user_id === member.user_id,
                  ) ? (
                    <button
                      disabled={busy !== ""}
                      onClick={() => void removeSavedProfile(member.user_id)}
                    >
                      Saved
                    </button>
                  ) : (
                    <button
                      disabled={busy !== ""}
                      onClick={() =>
                        void saveProfile(
                          member.user_id,
                          member.display_name || "this member",
                        )
                      }
                    >
                      Save for later
                    </button>
                  )}
                </div>
                <small className="directory-privacy-note">
                  {connectionModeFor(member.user_id) === "open"
                    ? "Messaging opens only after she accepts."
                    : connectionModeFor(member.user_id) === "curated_only"
                      ? "She welcomes only introductions proposed by Her Africa Table."
                      : "She has paused new introductions for now."}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <strong>No members match this search</strong>
            <p>Try a broader role, company, industry, or city.</p>
          </div>
        )}
      </section>
      <details className="network-code-tools">
        <summary>
          <span>
            <strong>Met someone in person?</strong>
            <small>Use a private eight-character code to connect.</small>
          </span>
          <span>Open connection codes</span>
        </summary>
        <div className="network-identity">
          <div>
            <p className="eyebrow">Your connection code</p>
            <strong>{connectionCode}</strong>
            <span>
              Share this only with someone you intend to connect with. It
              identifies your profile but never reveals private details.
            </span>
          </div>
          <form onSubmit={submitCode}>
            <label>
              Enter her code
              <input
                value={code}
                maxLength={8}
                onChange={(e) =>
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                  )
                }
                placeholder="AB12CD34"
              />
            </label>
            <button
              className="button button-primary"
              disabled={busy !== "" || code.length !== 8}
            >
              Send request
            </button>
          </form>
        </div>
      </details>
      {blockedMembers.length ? (
        <section className="blocked-members">
          <p className="eyebrow">Blocked members</p>
          {blockedMembers.map((member) => (
            <div key={member.user_id}>
              <span>{member.display_name || "Member"}</span>
              <button
                disabled={busy !== ""}
                onClick={() => void safety(member.user_id, "unblock")}
              >
                Unblock
              </button>
            </div>
          ))}
        </section>
      ) : null}
      {message ? (
        <p className="network-message" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
