"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { useActionDialog } from "@/components/ui/action-dialog";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";

export type CommunityHostApplicationAdmin = {
  application_id: string;
  applicant_id: string;
  applicant_name: string;
  applicant_email: string;
  community_name: string;
  proposed_slug: string;
  category: string;
  purpose: string;
  intended_members: string;
  expected_members: number;
  admission_model: string;
  host_experience: string;
  safety_plan: string;
  applicant_message: string | null;
  status:
    | "pending"
    | "under_review"
    | "changes_requested"
    | "approved"
    | "declined"
    | "withdrawn";
  admin_note: string | null;
  submitted_at: string;
  updated_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_community_id: string | null;
  created_community_slug: string | null;
};

const statusLabels: Record<CommunityHostApplicationAdmin["status"], string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  declined: "Declined",
  pending: "New",
  under_review: "In review",
  withdrawn: "Withdrawn",
};

const detailLabels: Record<string, string> = {
  application_review: "Host reviews every request",
  business_and_career: "Business & career",
  creative_industries: "Creative industries",
  hobby_and_interest: "Hobby & shared interest",
  investment: "Investment",
  invitation_only: "Invitation only",
  leadership: "Leadership",
  open_request: "Open requests with light review",
  other: "Other",
  social_impact: "Social impact",
  technology: "Technology",
  wellbeing: "Wellbeing",
};

export function CommunityHostApplicationManager({
  applications,
  migrationReady,
}: {
  applications: CommunityHostApplicationAdmin[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const openStatuses = ["pending", "under_review", "changes_requested"];
  const visible = applications.filter((item) =>
    filter === "all"
      ? true
      : filter === "open"
        ? openStatuses.includes(item.status)
        : !openStatuses.includes(item.status),
  );
  const newCount = applications.filter((item) => item.status === "pending").length;
  const reviewCount = applications.filter(
    (item) => item.status === "under_review",
  ).length;
  const approvedCount = applications.filter(
    (item) => item.status === "approved",
  ).length;

  async function review(
    event: FormEvent<HTMLFormElement>,
    application: CommunityHostApplicationAdmin,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nativeEvent = event.nativeEvent as SubmitEvent;
    const action =
      nativeEvent.submitter instanceof HTMLButtonElement
        ? nativeEvent.submitter.value
        : "";
    if (!action) return;
    if (action === "approve" || action === "decline") {
      const confirmed = await ask({
        confirmLabel:
          action === "approve" ? "Approve and create draft" : "Decline proposal",
        description:
          action === "approve"
            ? "This creates a private draft community and makes the applicant its owner. Publication still requires the full release checks."
            : "This closes the proposal. The applicant will see your review note and may submit a new idea.",
        title:
          action === "approve"
            ? `Approve ${application.community_name}?`
            : `Decline ${application.community_name}?`,
        tone: action === "approve" ? "default" : "danger",
      });
      if (!confirmed) return;
    }

    setBusy(application.application_id);
    setMessage("");
    const { error } = await supabase.rpc(
      "review_community_host_application",
      {
        p_action: action,
        p_admin_note: String(form.get("admin_note") ?? ""),
        p_application_id: application.application_id,
        p_approved_slug: String(
          form.get("approved_slug") ?? application.proposed_slug,
        ),
      },
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "review this community application")
        : action === "approve"
          ? "Application approved. A private draft community and owner access were created."
          : action === "request_changes"
            ? "Guidance sent. The member can now update and resubmit."
            : action === "start_review"
              ? "Application moved into review."
              : "Application declined and the member was notified.",
    );
    if (!error) router.refresh();
  }

  if (!migrationReady) {
    return (
      <section className="admin-section" id="community-host-applications">
        <div className="admin-empty">
          <strong>Community host applications need the latest update</strong>
          <p>
            No application can be submitted or reviewed until the forward-only
            host application migration is applied.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="admin-section community-host-applications-admin"
      id="community-host-applications"
    >
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Host admission</p>
          <h2>Community applications</h2>
          <p>
            Review the purpose, audience and operating boundaries before a
            private draft room is created. Approval never publishes a room.
          </p>
        </div>
      </div>

      <div className="community-host-review-summary">
        <article>
          <span>New</span>
          <strong>{newCount}</strong>
          <small>Awaiting first review</small>
        </article>
        <article>
          <span>In review</span>
          <strong>{reviewCount}</strong>
          <small>Currently with the team</small>
        </article>
        <article>
          <span>Approved</span>
          <strong>{approvedCount}</strong>
          <small>Draft communities created</small>
        </article>
      </div>

      <div
        className="community-host-review-filters"
        aria-label="Application status"
      >
        {(["open", "closed", "all"] as const).map((value) => (
          <button
            aria-pressed={filter === value}
            key={value}
            onClick={() => setFilter(value)}
          >
            {value === "open"
              ? "Needs attention"
              : value === "closed"
                ? "Completed"
                : "All applications"}
          </button>
        ))}
      </div>

      <div className="community-host-review-list">
        {visible.length ? (
          visible.map((application) => {
            const isOpen = openStatuses.includes(application.status);
            return (
              <article key={application.application_id}>
                <header>
                  <div>
                    <span
                      className={`community-review-state is-${application.status.replace("_", "-")}`}
                    >
                      {statusLabels[application.status]}
                    </span>
                    <h3>{application.community_name}</h3>
                    <p>
                      {application.applicant_name} ·{" "}
                      <a href={`mailto:${application.applicant_email}`}>
                        {application.applicant_email}
                      </a>
                    </p>
                  </div>
                  <dl>
                    <div>
                      <dt>Focus</dt>
                      <dd>
                        {detailLabels[application.category] ??
                          application.category}
                      </dd>
                    </div>
                    <div>
                      <dt>First year</dt>
                      <dd>{application.expected_members} members</dd>
                    </div>
                    <div>
                      <dt>Admission</dt>
                      <dd>
                        {detailLabels[application.admission_model] ??
                          application.admission_model}
                      </dd>
                    </div>
                  </dl>
                </header>

                <div className="community-host-review-answers">
                  <section>
                    <span>Shared purpose</span>
                    <p>{application.purpose}</p>
                  </section>
                  <section>
                    <span>Who it is for</span>
                    <p>{application.intended_members}</p>
                  </section>
                  <section>
                    <span>Host readiness</span>
                    <p>{application.host_experience}</p>
                  </section>
                  <section>
                    <span>Safety and boundaries</span>
                    <p>{application.safety_plan}</p>
                  </section>
                  {application.applicant_message ? (
                    <section>
                      <span>Additional context</span>
                      <p>{application.applicant_message}</p>
                    </section>
                  ) : null}
                </div>

                {isOpen ? (
                  <form onSubmit={(event) => void review(event, application)}>
                    <div className="community-host-review-fields">
                      <label>
                        Draft URL
                        <div>
                          <span>/communities/</span>
                          <input
                            defaultValue={application.proposed_slug}
                            name="approved_slug"
                            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                            required
                          />
                        </div>
                      </label>
                      <label>
                        Review note
                        <textarea
                          defaultValue={application.admin_note ?? ""}
                          maxLength={2000}
                          name="admin_note"
                          placeholder="Required when requesting changes or declining."
                          rows={3}
                        />
                      </label>
                    </div>
                    <footer>
                      {application.status === "pending" ? (
                        <button
                          className="button button-outline"
                          disabled={busy === application.application_id}
                          name="action"
                          value="start_review"
                        >
                          Start review
                        </button>
                      ) : null}
                      <button
                        className="button button-outline"
                        disabled={busy === application.application_id}
                        name="action"
                        value="request_changes"
                      >
                        Request changes
                      </button>
                      <button
                        className="button button-primary"
                        disabled={busy === application.application_id}
                        name="action"
                        value="approve"
                      >
                        {busy === application.application_id
                          ? "Saving…"
                          : "Approve and create draft"}
                      </button>
                      <button
                        className="button button-quiet"
                        disabled={busy === application.application_id}
                        name="action"
                        value="decline"
                      >
                        Decline
                      </button>
                    </footer>
                  </form>
                ) : (
                  <footer className="community-host-review-closed">
                    <span>
                      Reviewed{" "}
                      {application.reviewed_by_name
                        ? `by ${application.reviewed_by_name}`
                        : "by the Community team"}
                    </span>
                    {application.created_community_slug ? (
                      <Link
                        className="button button-outline"
                        href={`/admin/cohort?community=${application.created_community_id}`}
                      >
                        Open release checks
                      </Link>
                    ) : null}
                  </footer>
                )}
              </article>
            );
          })
        ) : (
          <div className="admin-empty">
            <strong>No applications in this view</strong>
            <p>New host proposals will appear here automatically.</p>
          </div>
        )}
      </div>

      {message ? (
        <p className="admin-message" role="status">
          {message}
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
