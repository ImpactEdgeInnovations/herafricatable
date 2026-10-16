"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CommunitySummary } from "@/components/member/community-directory";
import { useActionDialog } from "@/components/ui/action-dialog";
import { useAdminOperation } from "@/lib/use-admin-operation";
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
  joiningReady,
  migrationReady,
}: {
  acceptanceMode: boolean;
  communities: CommunitySummary[];
  members: CommunityMember[];
  enabled: boolean;
  joiningReady: boolean;
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog, clearDraft } = useActionDialog({ retainDrafts: true });
  const [selected, setSelected] = useState(communities[0]?.community_id ?? "");
  const [message, setMessage] = useState("");
  const { busy, setBusy, runAdminAction, markSaved } = useAdminOperation<string>("", "pending", setMessage, clearDraft);
  const community = communities.find((item) => item.community_id === selected);
  async function toggle() {
    const actionKey = "communities-flag";
    return runAdminAction(actionKey, async () => {
      setBusy("flag");
      const { error } = await supabase.rpc("set_feature_flag", {
        p_enabled: !enabled,
        p_key: "communities",
      });
      if (!error) markSaved();
      setBusy("");
      setMessage(
        error
          ? adminErrorMessage(error, "change Community availability")
          : `Communities ${enabled ? "disabled" : "enabled"}.`,
      );
      if (!error) router.refresh();
    });
  }
  async function toggleAcceptanceMode() {
    const actionKey = "community-test-mode";
    return runAdminAction(actionKey, async () => {
      const result = await ask({ draftKey: actionKey,
        title: acceptanceMode
          ? "Turn off Community test mode?"
          : "Turn on Community test mode?",
        description: acceptanceMode
          ? "Tagged test accounts will immediately lose Community access. Their memberships, posts and evidence remain preserved."
          : "Only active accounts explicitly tagged as test accounts can enter Community. Real members remain blocked until the release checks pass.",
        confirmLabel: acceptanceMode ? "Turn off test mode" : "Turn on test mode",
        tone: acceptanceMode ? "danger" : "default",
      });
      if (!result) return;
      setBusy("acceptance-mode");
      setMessage("");
      const { error } = await supabase.rpc("set_feature_flag", {
        p_enabled: !acceptanceMode,
        p_key: "community_acceptance_mode",
      });
      if (!error) markSaved();
      setBusy("");
      setMessage(
        error
          ? adminErrorMessage(error, "change Community test mode")
          : acceptanceMode
            ? "Community test mode is off. Test data has been kept."
            : "Community test mode is open only to marked test accounts.",
      );
      if (!error) router.refresh();
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const actionKey = "community-save:" + selected;
    return runAdminAction(actionKey, async () => {
      const form = new FormData(event.currentTarget);
      setBusy("save");
      const { data: savedCommunityId, error } = await supabase.rpc("save_community", {
        p_community_id: form.get("id") || null,
        p_description: form.get("description"),
        p_name: form.get("name"),
        p_slug: form.get("slug"),
        p_status: form.get("status"),
        p_type: form.get("type"),
      });
      if (!error) markSaved();
      const joiningMode = form.get("admissionMode") ?? "approval";
      const joiningError = !error && joiningReady && savedCommunityId
        ? (
            await supabase.rpc("save_community_joining_mode", {
              p_community_id: savedCommunityId,
              p_mode: joiningMode,
            })
          ).error
        : null;
      setBusy("");
      setMessage(
        error
          ? adminErrorMessage(error, "save this Community")
          : joiningError
            ? "Community details were saved, but its joining setting was not. Check the saved details before trying the joining setting again."
          : "Community saved and audited.",
      );
      if (!error && !joiningError) router.refresh();
    });
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const actionKey = "community-invite:" + selected;
    return runAdminAction(actionKey, async () => {
      const form = new FormData(event.currentTarget);
      setBusy("invite");
      const { error } = await supabase.rpc("invite_community_member", {
        p_community_id: selected,
        p_email: form.get("email"),
        p_role: form.get("role"),
      });
      if (!error) markSaved();
      setBusy("");
      setMessage(
        error
          ? adminErrorMessage(error, "send this Community invitation")
          : "Invitation saved. Check Message delivery for its email status.",
      );
      if (!error) router.refresh();
    });
  }
  async function review(id: string, action: string) {
    if (action === "transfer_ownership") return lifecycle("replace_host", id);
    const actionKey = "community-member:" + id + ":" + action;
    return runAdminAction(actionKey, async () => {
      if(action === "remove" && !await ask({ draftKey: actionKey,title:`Remove ${members.find(item=>item.membership_id === id)?.display_name || "this member"} from the community?`,description:"She will lose access to this community. Her earlier posts and replies stay here, and her Her Africa Table account is not suspended or deleted. This does not automatically refund a payment.",confirmLabel:"Remove member",tone:"danger"}))return;
      setBusy(id);
      const { error } = await supabase.rpc("review_community_membership", {
        p_action: action,
        p_membership_id: id,
      });
      if (!error) markSaved();
      setBusy("");
      setMessage(
        error
          ? adminErrorMessage(error, "update this Community membership")
          : "Membership updated and audited.",
      );
      if (!error) router.refresh();
    });
  }
  async function lifecycle(action: string, successorMembershipId?: string) {
    const actionKey = "community-lifecycle:" + selected + ":" + action;
    return runAdminAction(actionKey, async () => {
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
      const answer = await ask({ draftKey: actionKey,
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
      if (!error) markSaved();
      setBusy("");
      setMessage(
        error
          ? adminErrorMessage(error, `${copy.confirm.toLowerCase()}`)
          : `${copy.confirm} completed and records preserved. Check Message delivery for member notices.`,
      );
      if (!error) router.refresh();
    });
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
          <p className="eyebrow">Community access</p>
          <h2>Communities</h2>
          <p>
            Create trusted spaces and check who can enter before opening them
            to members.
          </p>
        </div>
        <button
          className={enabled ? "danger-action" : ""}
          disabled={Boolean(busy)}
          onClick={() => void toggle()}
        >
          {enabled ? "Disable member access" : "Enable after sign-off"}
        </button>
      </div>
      <aside className={`community-acceptance-mode ${acceptanceMode ? "is-active" : ""}`}>
        <div>
          <span>{acceptanceMode ? "Test mode is on" : "Test mode is off"}</span>
          <strong>Test Community safely before members enter.</strong>
          <p>
            Only marked test accounts can enter in this mode. Use it to test
            two members, privacy, Admin help, pausing and reopening. Real
            members cannot enter.
          </p>
        </div>
        <button
          className={acceptanceMode ? "danger-action" : "button button-outline"}
          disabled={Boolean(busy)}
          onClick={() => void toggleAcceptanceMode()}
          type="button"
        >
          {busy === "acceptance-mode"
            ? "Updating…"
            : acceptanceMode
              ? "Turn off test mode"
              : "Turn on test mode"}
        </button>
      </aside>
      <div className="community-admin-layout">
        <form
          onSubmit={(event) => void save(event)}
          aria-describedby="community-editor-guide"
        >
          <p className="admin-form-guide" id="community-editor-guide">
            Public communities can welcome approved members immediately or
            review each request. Private communities always require Host
            approval. Create new spaces as Draft and open them only after the
            release checks pass.
          </p>
          <input disabled={Boolean(busy)}
            type="hidden"
            name="id"
            value={community?.community_id ?? ""}
          />
          <label>
            Community
            <select disabled={Boolean(busy)}
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
            <input disabled={Boolean(busy)}
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
            <input disabled={Boolean(busy)}
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={community?.slug ?? ""}
              key={`slug-${selected}`}
            />
          </label>
          <label>
            Description
            <textarea disabled={Boolean(busy)}
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
              <select disabled={Boolean(busy)}
                name="type"
                defaultValue={community?.community_type ?? "official"}
                key={`type-${selected}`}
              >
                <option value="official">Public Community page</option>
                <option value="private">Member-only Community page</option>
              </select>
            </label>
            {joiningReady ? (
              <label>
                Who can join?
                <select disabled={Boolean(busy)}
                  name="admissionMode"
                  defaultValue={community?.effective_mode ?? (community?.community_type === "private" ? "approval" : "open")}
                  key={`admission-${selected}`}
                >
                  <option value="open">Any active member joins immediately</option>
                  <option value="approval">Host reviews requests</option>
                  <option value="invite_only">Invitation only</option>
                </select>
              </label>
            ) : null}
            <label>
              Status
              <select disabled={Boolean(busy)}
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
          <button className="button button-primary" disabled={Boolean(busy)}>
            {busy === "save" ? "Saving…" : "Save community"}
          </button>
          {community ? (
            <Link
              className="admin-form-secondary-link"
              href={`/admin/cohort?community=${community.community_id}#community-release-title`}
            >
              Review release checklist →
            </Link>
          ) : null}
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
                  <input disabled={Boolean(busy)} name="email" type="email" required />
                </label>
                <label>
                  Role
                  <select disabled={Boolean(busy)} name="role">
                    <option value="member">Member</option>
                    <option value="moderator">Community moderator</option>
                  </select>
                </label>
                <button disabled={Boolean(busy)}>Send invitation</button>
              </form>
              <section className="community-lifecycle-controls">
                <div>
                  <strong>Pausing or closing this Community</strong>
                  <p>
                    Pause safely, replace an unavailable host, reopen after
                    checks, or close while keeping the records.
                  </p>
                </div>
                <div className="member-actions">
                  {community?.status === "published" ? (
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => void lifecycle("pause")}
                      type="button"
                    >
                      Pause community
                    </button>
                  ) : (
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => void lifecycle("reopen")}
                      type="button"
                    >
                      Reopen after checks
                    </button>
                  )}
                  {community?.status !== "archived" ? (
                    <button
                      className="danger-action"
                      disabled={Boolean(busy)}
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
                            disabled={Boolean(busy)}
                            onClick={() =>
                              void review(member.membership_id, "approve")
                            }
                          >
                            Approve
                          </button>
                          <button
                            disabled={Boolean(busy)}
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
                          disabled={Boolean(busy)}
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
                          disabled={Boolean(busy)}
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
                            disabled={Boolean(busy)}
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
                            disabled={Boolean(busy)}
                            onClick={() =>
                              void review(member.membership_id, "remove")
                            }
                          >
                            Remove member
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
