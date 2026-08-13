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
type NetworkView = "connections" | "history" | "requests";

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
  const [networkView, setNetworkView] = useState<NetworkView>(() =>
    connections.some((item) => item.status === "pending")
      ? "requests"
      : "connections",
  );
  const { ask, dialog } = useActionDialog();
  const connectionModeFor = (memberId: string) =>
    connectionAvailability.find((item) => item.user_id === memberId)
      ?.request_mode ?? "open";
  async function request(
    memberId: string | null,
    connectionCode: string | null,
  ) {
    const result = await ask({
      title: "Tell her why you would like to connect",
      description:
        "A short, friendly note helps her decide. Only the two of you can see it.",
      confirmLabel: "Send invitation",
      fields: [
        {
          name: "note",
          label: "Your note (optional)",
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
        : "Invitation sent. She can accept or decline privately.",
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
        : action === "accept"
          ? "You are connected. You can now send a private message."
          : "Invitation declined privately.",
    );
    if (!error) router.refresh();
  }
  async function respondToCuratedIntroduction(
    introductionId: string,
    action: "accept" | "decline",
  ) {
    if (action === "decline") {
      const result = await ask({
        title: "Not the right connection for now?",
        description:
          "No contact details will be shared. The other member will simply see that it is not moving forward.",
        confirmLabel: "Not this time",
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
          ? "You both agreed. You can now send a private message."
          : action === "accept"
            ? "You said yes. We will let you know if she does too."
            : "You chose not to connect this time.",
    );
    if (!error) router.refresh();
  }
  async function saveProfile(memberId: string, displayName: string) {
    const result = await ask({
      title: `Save ${displayName}?`,
      description:
        "This is private. She will not be notified, and no invitation will be sent.",
      confirmLabel: "Save",
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
        : "Saved. Only you can see this list.",
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
      title: `Add a reminder for ${displayName}`,
      description:
        "Your note and reminder are private. Neither the member nor our team can see them.",
      confirmLabel: existing ? "Update reminder" : "Save reminder",
      fields: [
        {
          initialValue: existing?.private_note ?? "",
          maxLength: 1000,
          minLength: 3,
          name: "note",
          label: "Note to yourself (optional)",
          placeholder:
            "For example: Interested in regional distribution and values careful partnerships.",
          type: "textarea",
        },
        {
          initialValue: existing?.next_step ?? "",
          maxLength: 300,
          minLength: 3,
          name: "nextStep",
          label: "What would you like to do next? (optional)",
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
        ? memberErrorMessage(error, "save this reminder")
        : "Your private reminder is saved.",
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
        ? memberErrorMessage(error, "complete this reminder")
        : "Reminder marked done.",
    );
    if (!error) router.refresh();
  }
  async function removeFollowup(connectionId: string) {
    const result = await ask({
      title: "Remove this reminder?",
      description:
        "Your note, next step and date will be deleted. Your connection will stay the same.",
      confirmLabel: "Remove reminder",
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
        ? memberErrorMessage(error, "remove this reminder")
        : "Reminder removed.",
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
        ? `Update what happened with ${displayName}`
        : `What happened after connecting with ${displayName}?`,
      description:
        "Your note stays private. If you allow anonymous counting, our team sees only the category—not either member’s identity.",
      confirmLabel: existing ? "Update result" : "Save result",
      fields: [
        {
          initialValue: existing?.outcome_type ?? "collaboration",
          label: "What happened?",
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
          help: "This is visible only to you—not the other member or our team.",
          initialValue: existing?.private_detail ?? "",
          label: "Private note",
          maxLength: 2000,
          minLength: 10,
          name: "detail",
          placeholder:
            "For example: We agreed to test a joint supplier programme in Nairobi.",
          required: true,
          type: "textarea",
        },
        {
          help: "Our team receives only an anonymous category total—never your note, name or the other member’s identity. The total stays hidden until at least three members contribute.",
          initialValue: existing?.share_anonymously ?? true,
          label: "Count this anonymously in Community results",
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
          ? "Your result and privacy choice are updated."
          : "Your result is saved privately.",
    );
    if (!error) router.refresh();
  }
  async function removeOutcome(outcomeId: string) {
    const result = await ask({
      title: "Delete this result?",
      description:
        "Your private note and any anonymous count will be removed. Your connection will stay the same.",
      confirmLabel: "Delete result",
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
        : "Result deleted.",
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
        title: "Remove this person from your connections?",
        description:
          "You will both lose shared contact access. You can ask to connect again later.",
        confirmLabel: "Remove",
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
          "Choose what worries you and tell the Her Africa Table safety team what happened.",
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
          ? "Your report was sent privately to the Her Africa Table safety team."
          : `Member ${action}ed.`,
    );
    if (!error) router.refresh();
  }
  function submitCode(e: FormEvent) {
    e.preventDefault();
    if (code.trim()) void request(null, code.trim());
  }
  const requestConnections = connections.filter(
    (item) => item.status === "pending",
  );
  const acceptedConnections = connections.filter(
    (item) => item.status === "accepted",
  );
  const historyConnections = acceptedConnections.filter(
    (item) =>
      followups.some(
        (followup) => followup.connection_id === item.connection_id,
      ) ||
      outcomes.some((outcome) => outcome.connection_id === item.connection_id),
  );
  const visibleConnections =
    networkView === "requests"
      ? requestConnections
      : networkView === "history"
        ? historyConnections
        : acceptedConnections;
  return (
    <>
      {dialog}
      {connections.length ? (
        <section className="network-connections">
          <div>
            <p className="eyebrow">Your connections</p>
            <h2>People you know</h2>
            <p className="network-section-intro">
              Invitations, conversations and private reminders stay together
              here.
            </p>
          </div>
          <div className="network-connection-workspace">
            <div
              aria-label="Choose a network view"
              className="network-view-tabs"
            >
              {(
                [
                  {
                    count: requestConnections.length,
                    id: "requests",
                    label: "Invitations",
                  },
                  {
                    count: acceptedConnections.length,
                    id: "connections",
                    label: "People you know",
                  },
                  {
                    count: historyConnections.length,
                    id: "history",
                    label: "Notes & reminders",
                  },
                ] as { count: number; id: NetworkView; label: string }[]
              ).map((view) => (
                <button
                  aria-controls="network-view-panel"
                  aria-pressed={networkView === view.id}
                  id={`network-tab-${view.id}`}
                  key={view.id}
                  onClick={() => setNetworkView(view.id)}
                  type="button"
                >
                  <span>{view.label}</span>
                  <small>{view.count}</small>
                </button>
              ))}
            </div>
            <div
              aria-live="polite"
              className="network-view-panel"
              id="network-view-panel"
              tabIndex={0}
            >
            {visibleConnections.length ? visibleConnections.map((item) => {
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
                            ? "Her note to you"
                            : "Your note"}
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
                            ? "Reminder due"
                            : "Your reminder"}
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
                        <span>What happened next</span>
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
                                  ? "Included anonymously in totals"
                                  : "Only you can see this"}
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
                    {item.status === "accepted"
                      ? "Connected"
                      : item.direction === "incoming"
                        ? "Invitation for you"
                        : "Invitation sent"}
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
                          void planFollowup(
                            item.connection_id,
                            item.display_name || "this member",
                          )
                        }
                      >
                        {followup ? "Edit reminder" : "Add reminder"}
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
                        Add result
                      </button>
                      <details className="network-more-actions">
                        <summary>More options</summary>
                        <div>
                          {followup?.next_step ? (
                            <button
                              disabled={busy !== ""}
                              onClick={() =>
                                void completeFollowup(item.connection_id)
                              }
                            >
                              Mark reminder done
                            </button>
                          ) : null}
                          {followup ? (
                            <button
                              disabled={busy !== ""}
                              onClick={() =>
                                void removeFollowup(item.connection_id)
                              }
                            >
                              Remove reminder
                            </button>
                          ) : null}
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
                            Remove connection
                          </button>
                          <button
                            disabled={busy !== ""}
                            onClick={() =>
                              void safety(item.other_user_id, "report")
                            }
                          >
                            Report privately
                          </button>
                          <button
                            className="danger-action"
                            disabled={busy !== ""}
                            onClick={() =>
                              void safety(item.other_user_id, "block")
                            }
                          >
                            Block member
                          </button>
                        </div>
                      </details>
                    </div>
                  ) : null}
                </article>
              );
            }) : (
              <div className="network-view-empty">
                <strong>
                  {networkView === "requests"
                      ? "No invitations waiting"
                    : networkView === "history"
                      ? "No notes or reminders yet"
                      : "No connections yet"}
                </strong>
                <p>
                  {networkView === "requests"
                    ? "New invitations you send or receive will appear here."
                    : networkView === "history"
                      ? "Private reminders and results will appear here when you add them."
                      : "Choose someone below and ask to connect when it feels relevant."}
                </p>
              </div>
            )}
            </div>
          </div>
        </section>
      ) : null}
      {curatedIntroductions.some((item) => item.status === "pending") ? (
        <section
          className="curated-introductions"
          id="curated-introductions"
        >
          <header>
            <p className="eyebrow">Suggested by Her Africa Table</p>
            <h2>Someone you may enjoy meeting</h2>
            <p>
              You each decide privately. Messaging opens only if you both say
              yes.
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
                      You said yes · waiting privately
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
                        Yes, I would like to meet
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
              <p className="eyebrow">Only you can see this</p>
              <h2>People you saved</h2>
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
              <p className="eyebrow">Suggested for you</p>
              <h2>Start with these members</h2>
              <p>
                Take a look at their profiles. If someone feels relevant, ask
                to connect—there is no pressure.
              </p>
            </div>
          </header>
          <div>
            {suggestedMembers.slice(0, 3).map((member) => (
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
                  <small>You may have something in common</small>
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
                      ? "Ask to connect"
                      : connectionModeFor(member.user_id) === "curated_only"
                        ? "Introductions through HAT"
                        : "Not available right now"}
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
                    Save
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="member-directory">
        <details
          className="member-directory-browser"
          open={Boolean(searchQuery || cityFilter || goalFilter)}
        >
          <summary>
            <span>Browse all members</span>
            <small>Search by name, work, location or what matters to you</small>
          </summary>
          <div className="member-directory-content">
        <header>
          <div>
            <p className="eyebrow">All members</p>
            <h2>Who would you like to meet?</h2>
            <p>
              Use one or two details. You can always change your search.
            </p>
          </div>
          <form className="directory-filters" method="get">
            <label>
              <span>Name or work</span>
              <input
                defaultValue={searchQuery}
                id="member-search"
                name="q"
                placeholder="Name, role or company"
              />
            </label>
            <label>
              <span>Location</span>
              <input
                defaultValue={cityFilter}
                name="city"
                placeholder="For example, Nairobi"
              />
            </label>
            <label>
              <span>What would you like?</span>
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
              <button type="submit">Show members</button>
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
                      <small>Would like to</small>
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
                  See profile
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
                          ? "Ask to connect"
                          : connectionModeFor(member.user_id) ===
                              "curated_only"
                            ? "Introductions through HAT"
                            : "Not available right now"}
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
                      Save
                    </button>
                  )}
                </div>
                <small className="directory-privacy-note">
                  {connectionModeFor(member.user_id) === "open"
                    ? "Messaging opens when you both agree."
                    : connectionModeFor(member.user_id) === "curated_only"
                      ? "Her Africa Table can make an introduction."
                      : "She is taking a pause from new connections."}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <strong>No one matches this search yet</strong>
            <p>Try fewer words or remove one of the filters.</p>
          </div>
        )}
          </div>
        </details>
      </section>
      <details className="network-code-tools">
        <summary>
          <span>
            <strong>Met someone in person?</strong>
            <small>Exchange a private code and connect without searching.</small>
          </span>
          <span>Connect with a code</span>
        </summary>
        <div className="network-identity">
          <div>
            <p className="eyebrow">Your private code</p>
            <strong>{connectionCode}</strong>
            <span>
              Share this only with someone you intend to connect with. It
              identifies your profile but never reveals private details.
            </span>
          </div>
          <form onSubmit={submitCode}>
            <label>
              Enter their code
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
              Ask to connect
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
