"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CommunitySummary } from "@/components/member/community-directory";
import { useActionDialog } from "@/components/ui/action-dialog";
import { adminErrorMessage } from "@/lib/admin-error";
export type CommunityMember = {
  community_id: string;
  membership_id: string;
  user_id: string;
  display_name: string;
  job_title: string | null;
  company: string | null;
  role: string;
  status: string;
  created_at: string;
};
export function CommunityManager({
  acceptanceMode,
  communities,
  members,
  enabled,
  migrationReady,
}: {
  acceptanceMode: boolean;
  communities: CommunitySummary[];
  members: CommunityMember[];
  enabled: boolean;
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [selected, setSelected] = useState(communities[0]?.community_id ?? "");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const community = communities.find((item) => item.community_id === selected);
  async function toggle() {
    setBusy("flag");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_enabled: !enabled,
      p_key: "communities",
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "change Community availability")
        : `Communities ${enabled ? "disabled" : "enabled"}.`,
    );
    if (!error) router.refresh();
  }
  async function toggleAcceptanceMode() {
    const result = await ask({
      title: acceptanceMode
        ? "End the Community rehearsal?"
        : "Open Community rehearsal for test accounts?",
      description: acceptanceMode
        ? "Tagged test accounts will immediately lose Community access. Their memberships, posts and evidence remain preserved."
        : "Only active accounts explicitly tagged as test accounts can enter Community. Real members remain blocked until the release checks pass.",
      confirmLabel: acceptanceMode ? "End rehearsal" : "Start controlled rehearsal",
      tone: acceptanceMode ? "danger" : "default",
    });
    if (!result) return;
    setBusy("acceptance-mode");
    setMessage("");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_enabled: !acceptanceMode,
      p_key: "community_acceptance_mode",
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "change the Community rehearsal boundary")
        : acceptanceMode
          ? "Community rehearsal ended. Test data remains preserved."
          : "Controlled rehearsal is open only to tagged test accounts.",
    );
    if (!error) router.refresh();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("save");
    const { error } = await supabase.rpc("save_community", {
      p_community_id: form.get("id") || null,
      p_description: form.get("description"),
      p_name: form.get("name"),
      p_slug: form.get("slug"),
      p_status: form.get("status"),
      p_type: form.get("type"),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "save this Community")
        : "Community saved and audited.",
    );
    if (!error) router.refresh();
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("invite");
    const { error } = await supabase.rpc("invite_community_member", {
      p_community_id: selected,
      p_email: form.get("email"),
      p_role: form.get("role"),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "send this Community invitation")
        : "Invitation sent to the member inbox.",
    );
    if (!error) router.refresh();
  }
  async function review(id: string, action: string) {
    if (action === "transfer_ownership") {
      await lifecycle("replace_host", id);
      return;
    }
    setBusy(id);
    const { error } = await supabase.rpc("review_community_membership", {
      p_action: action,
      p_membership_id: id,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "update this Community membership")
        : "Membership updated and audited.",
    );
    if (!error) router.refresh();
  }
  async function lifecycle(action: string, successorMembershipId?: string) {
    if (!selected) return;
    const labels: Record<string, { title: string; description: string; confirm: string }> = {
      pause: {
        title: `Pause ${community?.name ?? "this community"}?`,
        description: "Member access will stop immediately, while posts, memberships and payment records remain preserved. Backup moderators retain access to support the transition.",
        confirm: "Pause and preserve",
      },
      replace_host: {
        title: "Replace the Community host?",
        description: "The selected member becomes the owner. The previous owner loses host controls, while all Community content and records remain in place.",
        confirm: "Replace host",
      },
      reopen: {
        title: `Reopen ${community?.name ?? "this community"}?`,
        description: "This succeeds only after the release checks pass and an active host and backup moderator are assigned. Preserved member access will be restored.",
        confirm: "Reopen community",
      },
      close: {
        title: `Close ${community?.name ?? "this community"}?`,
        description: "New activity and member access will stop. Content, membership history, financial records and audit evidence remain preserved.",
        confirm: "Close and preserve",
      },
    };
    const copy = labels[action];
    const answer = await ask({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.confirm,
      tone: ["pause", "close", "replace_host"].includes(action) ? "danger" : "default",
      fields: [{
        name: "reason",
        label: "Operational reason",
        type: "textarea",
        minLength: 10,
        maxLength: 1000,
        required: true,
        help: "Explain the decision without including private member information.",
      }],
    });
    if (!answer) return;
    setBusy(`lifecycle-${action}`);
    setMessage("");
    const { error } = await supabase.rpc("manage_community_lifecycle", {
      p_action: action,
      p_community_id: selected,
      p_reason: String(answer.reason ?? ""),
      p_successor_membership_id: successorMembershipId ?? null,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, `${copy.confirm.toLowerCase()}`)
        : `${copy.confirm} completed, members informed and records preserved.`,
    );
    if (!error) router.refresh();
  }
  if (!migrationReady)
    return (
      <section className="admin-section" id="communities-admin">
        <div className="admin-empty">
          <strong>Community controls are temporarily unavailable</strong>
          <p>
            No community or membership has been changed. Reload this workspace
            in a moment.
          </p>
        </div>
      </section>
    );
  const scoped = members.filter((item) => item.community_id === selected);
  return (
    <section className="admin-section community-admin" id="communities-admin">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Controlled P1 release</p>
          <h2>Communities</h2>
          <p>
            Create trusted spaces and review membership before deliberately
            exposing the feature.
          </p>
        </div>
        <button
          className={enabled ? "danger-action" : ""}
          disabled={busy === "flag"}
          onClick={() => void toggle()}
        >
          {enabled ? "Disable member access" : "Enable after sign-off"}
        </button>
      </div>
      <aside className={`community-acceptance-mode ${acceptanceMode ? "is-active" : ""}`}>
        <div>
          <span>{acceptanceMode ? "Test rehearsal active" : "Test rehearsal closed"}</span>
          <strong>Prove Community before real members can enter.</strong>
          <p>
            This boundary admits tagged test accounts only. Use it for the
            two-member journey, privacy checks, Admin support and pause/recovery
            rehearsal; it never opens Community to real members.
          </p>
        </div>
        <button
          className={acceptanceMode ? "danger-action" : "button button-outline"}
          disabled={busy === "acceptance-mode"}
          onClick={() => void toggleAcceptanceMode()}
          type="button"
        >
          {busy === "acceptance-mode"
            ? "Updating…"
            : acceptanceMode
              ? "End rehearsal"
              : "Start test rehearsal"}
        </button>
      </aside>
      <div className="community-admin-layout">
        <form
          onSubmit={(event) => void save(event)}
          aria-describedby="community-editor-guide"
        >
          <p className="admin-form-guide" id="community-editor-guide">
            Official communities allow active members to join immediately.
            Private communities require host approval. Create new rooms as
            Draft; publication is controlled by the audited acceptance gate in
            the Founding cohort workspace.
          </p>
          <input
            type="hidden"
            name="id"
            value={community?.community_id ?? ""}
          />
          <label>
            Community
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Create new</option>
              {communities.map((item) => (
                <option key={item.community_id} value={item.community_id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              name="name"
              required
              minLength={3}
              maxLength={80}
              defaultValue={community?.name ?? ""}
              key={`name-${selected}`}
            />
          </label>
          <label>
            URL slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={community?.slug ?? ""}
              key={`slug-${selected}`}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              required
              minLength={20}
              maxLength={1200}
              defaultValue={community?.description ?? ""}
              key={`description-${selected}`}
            />
          </label>
          <div className="admin-form-row">
            <label>
              Type
              <select
                name="type"
                defaultValue={community?.community_type ?? "official"}
                key={`type-${selected}`}
              >
                <option value="official">Official — instant join</option>
                <option value="private">Private — host approval</option>
              </select>
            </label>
            <label>
              Status
              <select
                name="status"
                defaultValue={community?.status ?? "draft"}
                key={`status-${selected}`}
              >
                <option value="draft">Draft</option>
                {community?.status === "published" ? (
                  <option value="published">Published — acceptance passed</option>
                ) : null}
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <button className="button button-primary" disabled={busy === "save"}>
            {busy === "save" ? "Saving…" : "Save community"}
          </button>
        </form>
        <div className="community-member-admin">
          {selected ? (
            <>
              <form
                className="community-invite"
                onSubmit={(event) => void invite(event)}
                aria-describedby="community-invite-guide"
              >
                <p className="admin-form-guide" id="community-invite-guide">
                  Invitations are limited to active members. Moderator access
                  includes community membership and content-review controls.
                </p>
                <label>
                  Invite active member by email
                  <input name="email" type="email" required />
                </label>
                <label>
                  Role
                  <select name="role">
                    <option value="member">Member</option>
                    <option value="moderator">Community moderator</option>
                  </select>
                </label>
                <button disabled={busy === "invite"}>Send invitation</button>
              </form>
              <section className="community-lifecycle-controls">
                <div>
                  <strong>Continuity and offboarding</strong>
                  <p>
                    Pause safely, replace an unavailable host, reopen after
                    acceptance, or close while preserving records.
                  </p>
                </div>
                <div className="member-actions">
                  {community?.status === "published" ? (
                    <button
                      disabled={busy.startsWith("lifecycle-")}
                      onClick={() => void lifecycle("pause")}
                      type="button"
                    >
                      Pause community
                    </button>
                  ) : (
                    <button
                      disabled={busy.startsWith("lifecycle-")}
                      onClick={() => void lifecycle("reopen")}
                      type="button"
                    >
                      Reopen after checks
                    </button>
                  )}
                  {community?.status !== "archived" ? (
                    <button
                      className="danger-action"
                      disabled={busy.startsWith("lifecycle-")}
                      onClick={() => void lifecycle("close")}
                      type="button"
                    >
                      Close and preserve
                    </button>
                  ) : null}
                </div>
  </section>
              <div>
                {scoped.map((member) => (
                  <article key={member.membership_id}>
                    <div>
                      <strong>{member.display_name}</strong>
                      <small>
                        {[member.job_title, member.company]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                      <span>
                        {member.role} · {member.status}
                      </span>
                    </div>
                    <div className="member-actions">
                      {member.status === "requested" ? (
                        <>
                          <button
                            disabled={busy === member.membership_id}
                            onClick={() =>
                              void review(member.membership_id, "approve")
                            }
                          >
                            Approve
                          </button>
                          <button
                            disabled={busy === member.membership_id}
                            onClick={() =>
                              void review(member.membership_id, "decline")
                            }
                          >
                            Decline
                          </button>
                        </>
                      ) : null}
                      {member.status === "active" &&
                      member.role === "member" ? (
                        <button
                          disabled={busy === member.membership_id}
                          onClick={() =>
                            void review(member.membership_id, "promote")
                          }
                        >
                          Make moderator
                        </button>
                      ) : null}
                      {member.status === "active" &&
                      member.role === "moderator" ? (
                        <button
                          disabled={busy === member.membership_id}
                          onClick={() =>
                            void review(member.membership_id, "demote")
                          }
                        >
                          Remove moderator
                        </button>
                      ) : null}
                      {["active", "paused", "suspended"].includes(member.status) &&
                      member.role !== "owner" ? (
                        <>
                          <button
                            disabled={busy === member.membership_id}
                            onClick={() =>
                              void review(
                                member.membership_id,
                                "transfer_ownership",
                              )
                            }
                          >
                            Make owner
                          </button>
                          <button
                            className="danger-action"
                            disabled={busy === member.membership_id}
                            onClick={() =>
                              void review(member.membership_id, "remove")
                            }
                          >
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="admin-empty">
              <strong>Create or select a community</strong>
              <p>Membership and host controls will appear here.</p>
            </div>
          )}
        </div>
      </div>
      {message ? (
        <p className="manager-message content-manager-message">{message}</p>
      ) : null}
      {dialog}
    </section>
  );
}
