"use client";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
export type AdminReferralCampaign = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  max_referrals_per_member: number;
  max_total_referrals: number | null;
};
export type AdminReferral = {
  referral_id: string;
  campaign_id: string;
  campaign_name: string;
  referrer_id: string;
  referrer_name: string | null;
  referrer_email: string;
  invitee_email: string;
  relationship: string;
  vouch: string;
  status: string;
  review_note: string | null;
  created_at: string;
  claimed_at: string | null;
  activated_at: string | null;
};
const localDate = (value: string | null) =>
  value
    ? new Date(
        new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
export function ReferralManager({
  campaigns,
  referrals,
  enabled,
  migrationReady,
}: {
  campaigns: AdminReferralCampaign[];
  referrals: AdminReferral[];
  enabled: boolean;
  migrationReady: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const campaign = campaigns.find((item) => item.id === selected);
  async function toggle() {
    const result = await ask({ title: enabled ? "Pause member referrals?" : "Enable member referrals?", description: enabled ? "Members will no longer be able to submit new vouched invitations. Existing reviews remain available." : "Members will be able to submit vouched invitations under active campaign limits. Every invitation still requires Admin approval.", confirmLabel: enabled ? "Pause referrals" : "Enable referrals", tone: enabled ? "danger" : "default" });
    if (!result) return;
    setBusy("flag");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_enabled: !enabled,
      p_key: "referrals",
    });
    setBusy("");
    setMessage(
      error ? error.message : `Referrals ${enabled ? "disabled" : "enabled"}.`,
    );
    if (!error) window.location.reload();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("campaign");
    const { error } = await supabase.rpc("save_referral_campaign", {
      p_campaign_id: form.get("id") || null,
      p_description: form.get("description"),
      p_ends_at: form.get("ends_at")
        ? new Date(String(form.get("ends_at"))).toISOString()
        : null,
      p_member_limit: Number(form.get("member_limit")),
      p_name: form.get("name"),
      p_slug: form.get("slug"),
      p_starts_at: form.get("starts_at")
        ? new Date(String(form.get("starts_at"))).toISOString()
        : null,
      p_status: form.get("status"),
      p_total_limit: Number(form.get("total_limit")) || null,
    });
    setBusy("");
    setMessage(error ? error.message : "Referral campaign saved and audited.");
    if (!error) window.location.reload();
  }
  async function review(id: string, action: string) {
    const result = await ask({ title: action === "approve" ? "Approve this vouched invitation?" : action === "reject" ? "Decline this vouched invitation?" : "Revoke this invitation?", description: action === "approve" ? "Approval creates onboarding eligibility and queues the invitation email. It does not bypass member onboarding or Admin access controls." : action === "reject" ? "The invitee will not receive onboarding eligibility from this vouch." : "The approved invitation will no longer be claimable. Existing activated membership is not silently removed.", confirmLabel: action === "approve" ? "Approve invitation" : action === "reject" ? "Decline invitation" : "Revoke invitation", tone: action === "approve" ? "default" : "danger", fields: [{ name: "note", label: action === "approve" ? "Internal note (optional)" : action === "reject" ? "Reason for declining" : "Reason for revoking", type: "textarea", required: action !== "approve", minLength: action !== "approve" ? 5 : undefined, maxLength: 500, help: "Use at least 5 characters when a reason is required." }] });
    if (!result) return;
    const note = String(result.note ?? "");
    setBusy(id);
    const { error } = await supabase.rpc("review_vouched_referral", {
      p_action: action,
      p_note: note,
      p_referral_id: id,
    });
    setBusy("");
    setMessage(
      error
        ? error.message
        : action === "approve"
          ? "Invitation approved and queued for email delivery."
          : `Referral ${action}d.`,
    );
    if (!error) window.location.reload();
  }
  if (!migrationReady)
    return (
      <section className="admin-section" id="referrals-admin">
        <div className="admin-empty">
          <strong>Referrals migration required</strong>
          <p>
            Apply the latest vouched invitations migration to activate these
            controls.
          </p>
        </div>
      </section>
    );
  return (
    <section className="admin-section referral-admin" id="referrals-admin">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Trust-led growth</p>
          <h2>Vouched invitations</h2>
          <p>
            Control campaigns and review the member’s private rationale before
            issuing onboarding eligibility.
          </p>
        </div>
        <button
          className={enabled ? "danger-action" : ""}
          disabled={busy === "flag"}
          onClick={() => void toggle()}
        >
          {enabled ? "Disable referrals" : "Enable after sign-off"}
        </button>
      </div>
      <div className="referral-admin-layout">
        <form onSubmit={(event) => void save(event)}>
          <label>
            Campaign
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Create new</option>
              {campaigns.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="id" value={campaign?.id ?? ""} />
          <label>
            Name
            <input
              name="name"
              required
              minLength={3}
              defaultValue={campaign?.name ?? ""}
              key={`name-${selected}`}
            />
          </label>
          <label>
            URL slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={campaign?.slug ?? ""}
              key={`slug-${selected}`}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              required
              minLength={20}
              defaultValue={campaign?.description ?? ""}
              key={`description-${selected}`}
            />
          </label>
          <div className="admin-form-row">
            <label>
              Starts
              <input
                name="starts_at"
                type="datetime-local"
                defaultValue={localDate(campaign?.starts_at ?? null)}
                key={`starts-${selected}`}
              />
            </label>
            <label>
              Ends
              <input
                name="ends_at"
                type="datetime-local"
                defaultValue={localDate(campaign?.ends_at ?? null)}
                key={`ends-${selected}`}
              />
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              Per-member limit
              <input
                name="member_limit"
                type="number"
                min="1"
                max="50"
                defaultValue={campaign?.max_referrals_per_member ?? 5}
                key={`member-${selected}`}
              />
            </label>
            <label>
              Total limit
              <input
                name="total_limit"
                type="number"
                min="1"
                defaultValue={campaign?.max_total_referrals ?? ""}
                key={`total-${selected}`}
              />
            </label>
          </div>
          <label>
            Status
            <select
              name="status"
              defaultValue={campaign?.status ?? "draft"}
              key={`status-${selected}`}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="ended">Ended</option>
            </select>
          </label>
          <button
            className="button button-primary"
            disabled={busy === "campaign"}
          >
            Save campaign
          </button>
        </form>
        <div className="referral-review-list">
          {referrals.length ? (
            referrals.map((item) => (
              <article key={item.referral_id}>
                <header>
                  <div>
                    <strong>{item.invitee_email}</strong>
                    <small>
                      Vouched by {item.referrer_name || item.referrer_email} ·{" "}
                      {item.campaign_name}
                    </small>
                  </div>
                  <span className="member-status">
                    {item.status.replace("_", " ")}
                  </span>
                </header>
                <p>
                  <b>{item.relationship}</b>
                </p>
                <blockquote>{item.vouch}</blockquote>
                {item.review_note ? <small>{item.review_note}</small> : null}
                {item.status === "pending_review" ? (
                  <div className="member-actions">
                    <button
                      disabled={busy === item.referral_id}
                      onClick={() => void review(item.referral_id, "approve")}
                    >
                      Approve invitation
                    </button>
                    <button
                      disabled={busy === item.referral_id}
                      onClick={() => void review(item.referral_id, "reject")}
                    >
                      Decline
                    </button>
                  </div>
                ) : item.status === "approved" ? (
                  <button
                    className="danger-action"
                    disabled={busy === item.referral_id}
                    onClick={() => void review(item.referral_id, "revoke")}
                  >
                    Revoke invitation
                  </button>
                ) : null}
              </article>
            ))
          ) : (
            <div className="admin-empty">
              <strong>No vouched invitations</strong>
              <p>Member referrals will appear here for private review.</p>
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
