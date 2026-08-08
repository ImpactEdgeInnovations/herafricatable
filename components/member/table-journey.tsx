import Link from "next/link";

export type TableJourneyState = {
  journey_started_at: string;
  days_since_start: number;
  profile_ready: boolean;
  community_joined: boolean;
  community_slug: string | null;
  community_name: string | null;
  introduction_shared: boolean;
  gathering_reserved: boolean;
  trusted_connection_made: boolean;
  follow_up_planned: boolean;
  completed_steps: number;
  in_first_week: boolean;
};

type JourneyStep = {
  action: string;
  available?: boolean;
  complete: boolean;
  description: string;
  href: string;
  label: string;
};

export function TableJourney({
  communityAvailable = true,
  journey,
}: {
  communityAvailable?: boolean;
  journey: TableJourneyState;
}) {
  const communityHref = journey.community_slug
    ? `/communities/${journey.community_slug}`
    : "/communities";
  const steps: JourneyStep[] = [
    {
      action: journey.profile_ready ? "Review profile" : "Finish profile",
      complete: journey.profile_ready,
      description:
        "Share enough context for the right women to understand your work.",
      href: journey.profile_ready ? "/profile" : "/onboarding",
      label: "Make your profile useful",
    },
    {
      action: !communityAvailable
        ? "Opening soon"
        : journey.community_joined
        ? journey.introduction_shared
          ? "Open Community"
          : "Introduce yourself"
        : "Find a Community",
      available: communityAvailable,
      complete: journey.introduction_shared,
      description: !communityAvailable
        ? "The first trusted Communities are being prepared. This step will open when they are ready."
        : journey.community_joined
        ? `Enter ${journey.community_name ?? "your Community"} and share what you are building, offering and seeking.`
        : "Choose one focused Community, then introduce yourself when you are ready.",
      href: communityHref,
      label: "Take your seat in a Community",
    },
    {
      action: journey.gathering_reserved ? "View events" : "Find a gathering",
      complete: journey.gathering_reserved,
      description:
        "Reserve one gathering where a real conversation can begin.",
      href: "/events",
      label: "Join a gathering",
    },
    {
      action: journey.trusted_connection_made
        ? "View connections"
        : "Meet members",
      complete: journey.trusted_connection_made,
      description:
        "Choose one relevant member. Private conversation opens only after you both agree.",
      href: "/network",
      label: "Make one trusted connection",
    },
    {
      action: journey.follow_up_planned ? "View your network" : "Plan a follow-up",
      complete: journey.follow_up_planned,
      description:
        "Record a private next step so a valuable relationship does not get lost.",
      href: "/network",
      label: "Continue the relationship",
    },
  ];
  const complete = Math.min(Number(journey.completed_steps), steps.length);
  const recommended = steps.find(
    (step) => !step.complete && step.available !== false,
  );
  const allComplete = complete === steps.length;

  return (
    <section
      className="table-journey"
      id="table-journey"
      aria-labelledby="table-journey-title"
    >
      <header>
        <div>
          <p className="eyebrow">
            {journey.in_first_week ? "Your first seven days" : "Your Table Journey"}
          </p>
          <h2 id="table-journey-title">
            {allComplete ? "Your place at the table is taking shape." : "From joining to belonging."}
          </h2>
          <p>
            A calm path from your profile to one useful relationship. This is
            private guidance—not a score, requirement or public ranking.
          </p>
        </div>
        <span>{complete} of {steps.length}</span>
      </header>

      <div
        className="table-journey-progress"
        role="progressbar"
        aria-label={`${complete} of ${steps.length} Table Journey steps complete`}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={complete}
      >
        <i style={{ width: `${(complete / steps.length) * 100}%` }} />
      </div>

      {recommended ? (
        <div className="table-journey-next">
          <div>
            <span>Recommended now</span>
            <strong>{recommended.label}</strong>
            <p>{recommended.description}</p>
          </div>
          <Link className="button button-primary" href={recommended.href}>
            {recommended.action}
          </Link>
        </div>
      ) : (
        <div className="table-journey-complete">
          <span aria-hidden="true">✓</span>
          <p>
            You are all set. Return when you want to meet, contribute or plan
            the next conversation—there is no activity quota.
          </p>
        </div>
      )}

      <details className="table-journey-steps">
        <summary>
          <span>See the full journey</span>
          <small>{allComplete ? "Complete" : `${steps.length - complete} to explore`}</small>
        </summary>
        <ol>
          {steps.map((step, index) => (
            <li className={step.complete ? "is-complete" : ""} key={step.label}>
              <span>{step.complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{step.label}</strong>
                <p>{step.description}</p>
              </div>
              {step.available === false ? (
                <span className="table-journey-unavailable">{step.action}</span>
              ) : (
                <Link href={step.href}>{step.action}</Link>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
