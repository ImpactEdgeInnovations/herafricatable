"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
export type ReferralCampaign = {
  id: string;
  name: string;
  description: string;
  max_referrals_per_member: number;
  ends_at: string | null;
};
export type MemberReferral = {
  referral_id: string;
  campaign_id: string;
  campaign_name: string;
  code: string;
  invitee_email: string;
  relationship: string;
  vouch: string;
  status: string;
  review_note: string | null;
  created_at: string;
  claimed_at: string | null;
  activated_at: string | null;
};

const referralStatus: Record<string, string> = {
  activated: "Now a member",
  approved: "Invitation approved",
  claimed: "Membership in progress",
  expired: "Invitation expired",
  pending_review: "With our team",
  rejected: "Not approved",
  revoked: "Invitation closed",
};

export function ReferralCenter({
  campaigns,
  referrals,
}: {
  campaigns: ReferralCampaign[];
  referrals: MemberReferral[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    const { error } = await supabase.rpc("create_vouched_referral", {
      p_campaign_id: form.get("campaign_id"),
      p_email: form.get("email"),
      p_relationship: form.get("relationship"),
      p_vouch: form.get("vouch"),
    });
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "submit this referral")
        : "Thank you. Your introduction is with our team for a private review.",
    );
    if (!error) {
      formElement.reset();
      router.refresh();
    }
  }
  const firstCampaign = campaigns[0];
  const usedForFirstCampaign = referrals.filter(
    (item) =>
      item.campaign_id === firstCampaign?.id &&
      !["expired", "rejected", "revoked"].includes(item.status),
  ).length;
  return (
    <>
      <section className="referral-promise" aria-label="How member invitations work">
        <div><span>1</span><p><strong>You make a thoughtful introduction</strong><small>Tell us how you know her and why she belongs at the table.</small></p></div>
        <div><span>2</span><p><strong>Our team checks it privately</strong><small>Her email is not contacted before approval.</small></p></div>
        <div><span>3</span><p><strong>She chooses whether to join</strong><small>Every woman still completes her own membership journey.</small></p></div>
      </section>
      <section className="referral-intro">
        <div>
          <p className="eyebrow">A personal introduction</p>
          <h2>Bring one remarkable woman to the table.</h2>
          <p>
            Think of someone you know well enough to introduce with confidence.
            Your note stays private between you and our membership team.
          </p>
          {firstCampaign ? (
            <aside className="referral-campaign-note">
              <strong>{firstCampaign.name}</strong>
              <p>{firstCampaign.description}</p>
              <small>
                {Math.max(firstCampaign.max_referrals_per_member - usedForFirstCampaign, 0)} of {firstCampaign.max_referrals_per_member} introductions available
              </small>
            </aside>
          ) : null}
        </div>
        <form onSubmit={(event) => void submit(event)}>
          {campaigns.length > 1 ? (
            <label>
            Invitation programme
            <select
              name="campaign_id"
              required
              aria-describedby="referral-campaign-help"
            >
              {campaigns.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <small className="form-help" id="referral-campaign-help">
              Choose the invitation that best fits this introduction.
            </small>
            </label>
          ) : (
            <input name="campaign_id" type="hidden" value={firstCampaign?.id ?? ""}/>
          )}
          <label>
            Her email address
            <input
              name="email"
              type="email"
              required
              aria-describedby="referral-email-help"
            />
            <small className="form-help" id="referral-email-help">
              We contact her only if your introduction is approved.
            </small>
          </label>
          <label>
            How do you know her?
            <input
              name="relationship"
              minLength={3}
              maxLength={120}
              required
              placeholder="Former colleague, founder peer, mentor…"
            />
          </label>
          <label>
            Why would she strengthen the table?
            <textarea
              name="vouch"
              minLength={20}
              maxLength={1200}
              required
              placeholder="Share one or two specific qualities, experiences or contributions that make you think of her."
              aria-describedby="referral-vouch-help"
            />
            <small className="form-help" id="referral-vouch-help">
              Keep it warm and specific. She will not see this private note.
            </small>
          </label>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Sending…" : "Send for private review"}
          </button>
        </form>
      </section>
      <section className="referral-history">
        <header>
          <div>
            <p className="eyebrow">Your invitations</p>
            <h2>Your introductions</h2>
          </div>
          <span>
            {referrals.filter((item) => item.status === "activated").length}{" "}
            activated
          </span>
        </header>
        {referrals.length ? (
          <div>
            {referrals.map((item) => (
              <article key={item.referral_id}>
                <div>
                  <strong>{item.invitee_email}</strong>
                  <small>
                    {item.campaign_name} ·{" "}
                    {new Intl.DateTimeFormat("en-KE", {
                      dateStyle: "medium",
                    }).format(new Date(item.created_at))}
                  </small>
                </div>
                <span className={`member-status status-${item.status}`}>
                  {referralStatus[item.status] ?? "In progress"}
                </span>
                <p>{item.relationship}</p>
                {item.review_note &&
                ["rejected", "revoked"].includes(item.status) ? (
                  <small>{item.review_note}</small>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <strong>No referrals submitted</strong>
            <p>
              Use your invitation thoughtfully when the right woman comes to
              mind.
            </p>
          </div>
        )}
      </section>
      {message ? (
        <p className="network-message" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
