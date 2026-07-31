"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { useActionDialog } from "@/components/ui/action-dialog";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CommunityHostApplicationState = {
  application_id: string;
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
  created_community_id: string | null;
  created_community_slug: string | null;
};

const statusCopy: Record<
  CommunityHostApplicationState["status"],
  { label: string; summary: string }
> = {
  approved: {
    label: "Approved",
    summary:
      "Your private draft room is ready. Set up the experience before inviting members.",
  },
  changes_requested: {
    label: "Update requested",
    summary:
      "The Community team left guidance. Refine your application and send it back.",
  },
  declined: {
    label: "Reviewed",
    summary:
      "This proposal is not moving forward in its current form. You can apply again with a different idea.",
  },
  pending: {
    label: "Submitted",
    summary:
      "Your application is safely in the review queue. We will update you in Community and Activity.",
  },
  under_review: {
    label: "In review",
    summary:
      "The Community team is reviewing the purpose, audience and hosting boundaries.",
  },
  withdrawn: {
    label: "Withdrawn",
    summary: "This application is closed. You can begin a new proposal.",
  },
};

const categoryLabels: Record<string, string> = {
  business_and_career: "Business & career",
  creative_industries: "Creative industries",
  hobby_and_interest: "Hobby & shared interest",
  investment: "Investment",
  leadership: "Leadership",
  other: "Other",
  social_impact: "Social impact",
  technology: "Technology",
  wellbeing: "Wellbeing",
};

export function CommunityHostApplication({
  applications,
  migrationReady,
}: {
  applications: CommunityHostApplicationState[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const current = applications.find((item) =>
    ["pending", "under_review", "changes_requested", "approved"].includes(
      item.status,
    ),
  );
  const editable =
    current?.status === "pending" || current?.status === "changes_requested";
  const [open, setOpen] = useState(current?.status === "changes_requested");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("save");
    setMessage("");
    const { error } = await supabase.rpc(
      "save_community_host_application",
      {
        p_accept_guidelines: form.get("accept_guidelines") === "on",
        p_admission_model: String(form.get("admission_model") ?? ""),
        p_applicant_message: String(form.get("applicant_message") ?? ""),
        p_application_id: editable ? current.application_id : null,
        p_category: String(form.get("category") ?? ""),
        p_community_name: String(form.get("community_name") ?? ""),
        p_expected_members: Number(form.get("expected_members")),
        p_host_experience: String(form.get("host_experience") ?? ""),
        p_intended_members: String(form.get("intended_members") ?? ""),
        p_purpose: String(form.get("purpose") ?? ""),
        p_safety_plan: String(form.get("safety_plan") ?? ""),
      },
    );
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "send your community application")
        : editable
          ? "Application updated and returned to the review queue."
          : "Application sent. You can follow its progress here.",
    );
    if (!error) {
      setOpen(false);
      router.refresh();
    }
  }

  async function withdraw() {
    if (!current || !editable) return;
    const confirmed = await ask({
      confirmLabel: "Withdraw application",
      description:
        "This closes the current application. It will not remove any approved community.",
      title: "Withdraw this application?",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy("withdraw");
    setMessage("");
    const { error } = await supabase.rpc(
      "withdraw_community_host_application",
      { p_application_id: current.application_id },
    );
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "withdraw your community application")
        : "Application withdrawn. You can create a new proposal at any time.",
    );
    if (!error) {
      setOpen(false);
      router.refresh();
    }
  }

  if (!migrationReady) {
    return (
      <section className="community-host-application" id="create-community">
        <div className="community-host-entry">
          <div>
            <p className="eyebrow">Lead a trusted room</p>
            <h2>Create a community</h2>
            <p>
              Host applications will open here as soon as the latest production
              database update is applied.
            </p>
          </div>
          <span className="community-host-entry-state">Opening soon</span>
        </div>
      </section>
    );
  }

  const canBegin = !current || ["declined", "withdrawn"].includes(current.status);
  const showForm = open && (canBegin || editable);
  const showJourney =
    open || Boolean(current && current.status !== "approved");
  const defaults = editable ? current : null;

  return (
    <section className="community-host-application" id="create-community">
      <div className="community-host-entry">
        <div>
          <p className="eyebrow">Lead a trusted room</p>
          <h2>Create a community</h2>
          <p>
            Bring together women around a clear purpose. Every new community is
            reviewed, created as a private draft and opened only after its host
            and safety boundaries are ready.
          </p>
        </div>
        {current ? (
          <span
            className={`community-host-entry-state is-${current.status.replace("_", "-")}`}
          >
            {statusCopy[current.status].label}
          </span>
        ) : (
          <button
            className="button button-primary"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Close application" : "Apply to create a community"}
          </button>
        )}
      </div>

      {showJourney ? (
        <ol
          className="community-host-steps"
          aria-label="Community approval steps"
        >
          <li>
            <span>1</span>
            <div>
              <strong>Share the idea</strong>
              <small>Purpose, people and the value you will create.</small>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Complete review</strong>
              <small>We confirm fit, boundaries and host readiness.</small>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Prepare in private</strong>
              <small>Your draft room opens before any member can join.</small>
            </div>
          </li>
        </ol>
      ) : (
        <div className="community-host-principles" aria-label="Host safeguards">
          <span>Reviewed by the Community team</span>
          <span>Private draft first</span>
          <span>Published only after safety checks</span>
        </div>
      )}

      {current ? (
        <article className="community-host-status">
          <div>
            <span className="community-status-dot" aria-hidden="true" />
            <div>
              <p className="eyebrow">{statusCopy[current.status].label}</p>
              <h3>{current.community_name}</h3>
              <p>{statusCopy[current.status].summary}</p>
            </div>
          </div>
          {current.admin_note ? (
            <blockquote>
              <strong>Note from the Community team</strong>
              <p>{current.admin_note}</p>
            </blockquote>
          ) : null}
          <footer>
            {current.status === "approved" && current.created_community_slug ? (
              <>
                <Link
                  className="button button-primary"
                  href={`/communities/${current.created_community_slug}`}
                >
                  Open your community
                </Link>
                <Link
                  className="button button-outline"
                  href={`/communities/${current.created_community_slug}/host`}
                >
                  Open host workspace
                </Link>
              </>
            ) : editable ? (
              <>
                <button
                  className="button button-primary"
                  onClick={() => setOpen((value) => !value)}
                >
                  {open
                    ? "Close editor"
                    : current.status === "changes_requested"
                      ? "Update and resubmit"
                      : "Edit application"}
                </button>
                <button
                  className="button button-quiet"
                  disabled={busy === "withdraw"}
                  onClick={() => void withdraw()}
                >
                  {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
                </button>
              </>
            ) : null}
          </footer>
        </article>
      ) : null}

      {showForm ? (
        <form
          className="community-host-form"
          onSubmit={(event) => void submit(event)}
        >
          <header>
            <p className="eyebrow">
              {editable ? "Refine your proposal" : "Host application"}
            </p>
            <h3>What will bring this room to life?</h3>
            <p>
              Write as you would explain the idea to a future member. You can
              refine a submitted application until review begins.
            </p>
          </header>
          <div className="community-host-form-grid">
            <label>
              Community name
              <input
                defaultValue={defaults?.community_name ?? ""}
                maxLength={80}
                minLength={3}
                name="community_name"
                placeholder="e.g. Women Building in Climate"
                required
              />
            </label>
            <label>
              Main focus
              <select
                defaultValue={defaults?.category ?? ""}
                name="category"
                required
              >
                <option disabled value="">
                  Choose one
                </option>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-two">
              Why should this community exist?
              <textarea
                defaultValue={defaults?.purpose ?? ""}
                maxLength={1200}
                minLength={40}
                name="purpose"
                placeholder="Describe the shared purpose and what members should gain from belonging."
                required
                rows={5}
              />
            </label>
            <label className="span-two">
              Who is it for?
              <textarea
                defaultValue={defaults?.intended_members ?? ""}
                maxLength={600}
                minLength={20}
                name="intended_members"
                placeholder="Describe the women who would benefit and any important eligibility boundaries."
                required
                rows={3}
              />
            </label>
            <label>
              Expected first-year members
              <input
                defaultValue={defaults?.expected_members ?? 20}
                max={100000}
                min={5}
                name="expected_members"
                required
                type="number"
              />
            </label>
            <label>
              How should members enter?
              <select
                defaultValue={
                  defaults?.admission_model ?? "application_review"
                }
                name="admission_model"
                required
              >
                <option value="application_review">
                  Host reviews every request
                </option>
                <option value="invitation_only">Invitation only</option>
                <option value="open_request">
                  Open requests with light review
                </option>
              </select>
            </label>
            <label className="span-two">
              What prepares you to host?
              <textarea
                defaultValue={defaults?.host_experience ?? ""}
                maxLength={1000}
                minLength={20}
                name="host_experience"
                placeholder="Share relevant community, leadership, facilitation or subject experience."
                required
                rows={3}
              />
            </label>
            <label className="span-two">
              How will you keep the room useful and safe?
              <textarea
                defaultValue={defaults?.safety_plan ?? ""}
                maxLength={1200}
                minLength={40}
                name="safety_plan"
                placeholder="Explain your moderation rhythm, boundaries and how you would respond to a concern."
                required
                rows={4}
              />
            </label>
            <label className="span-two">
              Anything else we should know? <small>Optional</small>
              <textarea
                defaultValue={defaults?.applicant_message ?? ""}
                maxLength={1000}
                name="applicant_message"
                placeholder="Add context, timing or links you would like the review team to consider."
                rows={3}
              />
            </label>
          </div>
          <label className="community-host-consent">
            <input name="accept_guidelines" required type="checkbox" />
            <span>
              I will follow the{" "}
              <Link href="/community-guidelines">Community Guidelines</Link> and
              understand that approval creates a private draft, not an
              automatically published community.
            </span>
          </label>
          <footer>
            <button
              className="button button-primary"
              disabled={busy === "save"}
            >
              {busy === "save"
                ? "Sending application…"
                : editable
                  ? "Save and resubmit"
                  : "Send application"}
            </button>
            <button
              className="button button-quiet"
              onClick={() => setOpen(false)}
              type="button"
            >
              Save nothing and close
            </button>
          </footer>
        </form>
      ) : null}

      {!current && applications.length > 0 ? (
        <button
          className="community-host-new-proposal"
          onClick={() => setOpen(true)}
        >
          Begin a new community proposal
        </button>
      ) : null}

      {message ? (
        <p className="network-message" role="status">
          {message}
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
