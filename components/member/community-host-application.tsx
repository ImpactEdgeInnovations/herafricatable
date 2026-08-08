"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
      "Your private community is ready to set up. Members cannot see it until the final checks are complete.",
  },
  changes_requested: {
    label: "Update requested",
    summary:
      "The Community team left a note. Update your application and send it back.",
  },
  declined: {
    label: "Reviewed",
    summary:
      "This proposal is not moving forward in its current form. You can apply again with a different idea.",
  },
  pending: {
    label: "Submitted",
    summary:
      "We received your application. We will update you here and under Updates.",
  },
  under_review: {
    label: "In review",
    summary:
      "The Community team is reviewing your idea, who it serves and how you will lead it.",
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

const admissionLabels: Record<string, string> = {
  application_review: "You approve each request",
  invitation_only: "Only invited members can join",
  open_request: "Anyone can request to join",
};

const applicationSteps = [
  { label: "Your idea", shortLabel: "Idea" },
  { label: "The people", shortLabel: "People" },
  { label: "How you will lead", shortLabel: "Leadership" },
  { label: "Review and send", shortLabel: "Review" },
];

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
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [reviewValues, setReviewValues] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open && stepHeadingRef.current) {
      stepHeadingRef.current.focus();
      stepHeadingRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [open, step]);

  function readApplication() {
    if (!formRef.current) return {};
    return Object.fromEntries(
      Array.from(new FormData(formRef.current).entries()).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
  }

  function openApplication() {
    setStep(0);
    setFurthestStep(0);
    setOpen(true);
  }

  function closeApplication() {
    setOpen(false);
  }

  function nextStep() {
    const panel = formRef.current?.querySelector<HTMLElement>(
      `[data-host-step="${step}"]`,
    );
    const fields = panel?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");
    if (fields) {
      for (const field of fields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          field.focus();
          return;
        }
      }
    }
    const next = Math.min(step + 1, applicationSteps.length - 1);
    if (next === applicationSteps.length - 1) {
      setReviewValues(readApplication());
    }
    setStep(next);
    setFurthestStep((currentStep) => Math.max(currentStep, next));
  }

  function previousStep() {
    setStep((currentStep) => Math.max(0, currentStep - 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < applicationSteps.length - 1) {
      nextStep();
      return;
    }
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
      closeApplication();
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
      closeApplication();
      router.refresh();
    }
  }

  if (!migrationReady) {
    return (
      <section className="community-host-application" id="create-community">
        <div className="community-host-entry">
          <div>
            <p className="eyebrow">Bring people together</p>
            <h2>Start a community</h2>
            <p>
              Applications are not open yet. You will be able to apply here
              when community setup is ready.
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
    !showForm && Boolean(current && current.status !== "approved");
  const defaults = editable ? current : null;

  return (
    <section className="community-host-application" id="create-community">
      <div className="community-host-entry">
        <div>
          <p className="eyebrow">Bring people together</p>
          <h2>Start a community</h2>
          <p>
            Have a clear idea for a group? Apply to lead it. We review every
            application, help you set up privately and open the community only
            when it is ready for members.
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
            onClick={() => (open ? closeApplication() : openApplication())}
          >
            {open ? "Close" : "Start your application"}
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
              <strong>Tell us your idea</strong>
              <small>Explain the purpose, the members and what they will gain.</small>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>We review it</strong>
              <small>We check the purpose, safety plan and your readiness to lead.</small>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Set up privately</strong>
              <small>Prepare the community before members can see or join it.</small>
            </div>
          </li>
        </ol>
      ) : (
        <div className="community-host-principles" aria-label="Host safeguards">
          <span>Every application is reviewed</span>
          <span>Set up privately first</span>
          <span>Open after safety checks</span>
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
                  Manage community
                </Link>
              </>
            ) : editable ? (
              <>
                <button
                  className="button button-primary"
                  onClick={() =>
                    open ? closeApplication() : openApplication()
                  }
                >
                  {open
                    ? "Close"
                    : current.status === "changes_requested"
                      ? "Update and resubmit"
                      : "Continue application"}
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
          ref={formRef}
        >
          <header>
            <p className="eyebrow">
              {editable ? "Update your application" : "Start a Community"}
            </p>
            <h3>Let’s shape your Community together.</h3>
            <p>
              Four short steps. Your answers stay here as you move back and
              forward, and nothing is sent until you confirm at the end.
            </p>
          </header>
          <nav
            aria-label="Application progress"
            className="community-host-form-progress"
          >
            <div>
              <span>
                Step {step + 1} of {applicationSteps.length}
              </span>
              <strong>{applicationSteps[step].label}</strong>
            </div>
            <ol>
              {applicationSteps.map((item, index) => (
                <li className={index < step ? "is-complete" : ""} key={item.label}>
                  <button
                    aria-current={index === step ? "step" : undefined}
                    disabled={index > furthestStep}
                    onClick={() => {
                      if (index === applicationSteps.length - 1) {
                        setReviewValues(readApplication());
                      }
                      setStep(index);
                    }}
                    type="button"
                  >
                    <span>{index + 1}</span>
                    <small>{item.shortLabel}</small>
                  </button>
                </li>
              ))}
            </ol>
            <span aria-hidden="true" className="community-host-form-progress-line">
              <i style={{ width: `${(step / (applicationSteps.length - 1)) * 100}%` }} />
            </span>
          </nav>

          <div className="community-host-form-carousel">
            <section
              aria-labelledby="community-host-step-idea"
              data-host-step="0"
              hidden={step !== 0}
            >
              <div className="community-host-step-heading">
                <span>01</span>
                <div>
                  <h4 id="community-host-step-idea" ref={step === 0 ? stepHeadingRef : undefined} tabIndex={-1}>
                    What would you like to bring people together around?
                  </h4>
                  <p>Start with a clear name and one shared purpose.</p>
                </div>
              </div>
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
                  <small>Choose a name members will understand immediately.</small>
                </label>
                <label>
                  Main focus
                  <select defaultValue={defaults?.category ?? ""} name="category" required>
                    <option disabled value="">Choose one</option>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="span-two">
                  Why should this Community exist?
                  <textarea
                    defaultValue={defaults?.purpose ?? ""}
                    maxLength={1200}
                    minLength={40}
                    name="purpose"
                    placeholder="What will bring members together, and what should they gain from belonging?"
                    required
                    rows={5}
                  />
                  <small>A few honest sentences are enough.</small>
                </label>
              </div>
            </section>

            <section
              aria-labelledby="community-host-step-people"
              data-host-step="1"
              hidden={step !== 1}
            >
              <div className="community-host-step-heading">
                <span>02</span>
                <div>
                  <h4 id="community-host-step-people" ref={step === 1 ? stepHeadingRef : undefined} tabIndex={-1}>
                    Who should feel at home here?
                  </h4>
                  <p>Describe the members and how you would like them to join.</p>
                </div>
              </div>
              <div className="community-host-form-grid">
                <label className="span-two">
                  Who is it for?
                  <textarea
                    defaultValue={defaults?.intended_members ?? ""}
                    maxLength={600}
                    minLength={20}
                    name="intended_members"
                    placeholder="Describe the women who would benefit and any important boundaries."
                    required
                    rows={4}
                  />
                </label>
                <label>
                  About how many members in the first year?
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
                  How should people join?
                  <select defaultValue={defaults?.admission_model ?? "application_review"} name="admission_model" required>
                    <option value="application_review">I approve each request</option>
                    <option value="invitation_only">Only invited members can join</option>
                    <option value="open_request">Anyone can request to join</option>
                  </select>
                </label>
              </div>
            </section>

            <section
              aria-labelledby="community-host-step-leadership"
              data-host-step="2"
              hidden={step !== 2}
            >
              <div className="community-host-step-heading">
                <span>03</span>
                <div>
                  <h4 id="community-host-step-leadership" ref={step === 2 ? stepHeadingRef : undefined} tabIndex={-1}>
                    How will you care for this Community?
                  </h4>
                  <p>Tell us how you will lead, welcome people and handle concerns.</p>
                </div>
              </div>
              <div className="community-host-form-grid">
                <label className="span-two">
                  What experience will help you lead?
                  <textarea
                    defaultValue={defaults?.host_experience ?? ""}
                    maxLength={1000}
                    minLength={20}
                    name="host_experience"
                    placeholder="Share any leadership, Community or subject experience that will help."
                    required
                    rows={4}
                  />
                </label>
                <label className="span-two">
                  How will you keep it useful and safe?
                  <textarea
                    defaultValue={defaults?.safety_plan ?? ""}
                    maxLength={1200}
                    minLength={40}
                    name="safety_plan"
                    placeholder="What rules will you set? How will you welcome members and respond when something goes wrong?"
                    required
                    rows={5}
                  />
                </label>
                <label className="span-two">
                  Anything else we should know? <small>Optional</small>
                  <textarea
                    defaultValue={defaults?.applicant_message ?? ""}
                    maxLength={1000}
                    name="applicant_message"
                    placeholder="Add useful timing, context or links."
                    rows={3}
                  />
                </label>
              </div>
            </section>

            <section
              aria-labelledby="community-host-step-review"
              data-host-step="3"
              hidden={step !== 3}
            >
              <div className="community-host-step-heading">
                <span>04</span>
                <div>
                  <h4 id="community-host-step-review" ref={step === 3 ? stepHeadingRef : undefined} tabIndex={-1}>
                    Does this feel right?
                  </h4>
                  <p>Read through your idea. You can go back and change anything before sending it.</p>
                </div>
              </div>
              <div className="community-host-application-review">
                <article>
                  <span>Your idea</span>
                  <h5>{reviewValues.community_name || "Community name"}</h5>
                  <small>{categoryLabels[reviewValues.category] || "Main focus"}</small>
                  <p>{reviewValues.purpose || "Your shared purpose will appear here."}</p>
                  <button onClick={() => setStep(0)} type="button">Change</button>
                </article>
                <article>
                  <span>The people</span>
                  <h5>{reviewValues.expected_members || "20"} members in the first year</h5>
                  <small>{admissionLabels[reviewValues.admission_model] || "How people will join"}</small>
                  <p>{reviewValues.intended_members || "Who the Community is for will appear here."}</p>
                  <button onClick={() => setStep(1)} type="button">Change</button>
                </article>
                <article>
                  <span>Your leadership</span>
                  <h5>How you will lead and keep people safe</h5>
                  <p>{reviewValues.host_experience || "Your experience will appear here."}</p>
                  <p>{reviewValues.safety_plan || "Your care and safety plan will appear here."}</p>
                  <button onClick={() => setStep(2)} type="button">Change</button>
                </article>
              </div>
              <label className="community-host-consent">
                <input name="accept_guidelines" required type="checkbox" />
                <span>
                  I will follow the{" "}
                  <Link href="/community-guidelines">Community Guidelines</Link>.
                  I understand that an approved Community is prepared privately
                  before members can join.
                </span>
              </label>
            </section>
          </div>
          <footer>
            <div>
              {step > 0 ? (
                <button className="button button-quiet" onClick={previousStep} type="button">
                  <span aria-hidden="true">←</span> Back
                </button>
              ) : (
                <button className="button button-quiet" onClick={closeApplication} type="button">
                  Close for now
                </button>
              )}
            </div>
            {step < applicationSteps.length - 1 ? (
              <button className="button button-primary" onClick={nextStep} type="button">
                Continue <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button className="button button-primary" disabled={busy === "save"}>
                {busy === "save"
                  ? "Sending…"
                  : editable
                    ? "Send updated application"
                    : "Send my application"}
              </button>
            )}
          </footer>
        </form>
      ) : null}

      {!current && applications.length > 0 ? (
        <button
          className="community-host-new-proposal"
          onClick={openApplication}
        >
          Start a new community application
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
