import Link from "next/link";

export type CommunityStartPathState = {
  joined_at: string;
  has_introduction: boolean;
  has_contribution: boolean;
  has_accepted_connection: boolean;
  has_upcoming_registration: boolean;
  next_gathering_slug: string | null;
  next_gathering_title: string | null;
  next_gathering_starts_at: string | null;
};

type StartStep = {
  action: string;
  complete: boolean;
  description: string;
  href: string;
  label: string;
};

const fallbackSteps: StartStep[] = [
  {
    action: "Open conversations",
    complete: false,
    description: "Share one useful Ask, Offer, resource or follow-up.",
    href: "#conversations",
    label: "Join the conversation",
  },
  {
    action: "Meet members",
    complete: false,
    description: "Understand her context before requesting a connection.",
    href: "#members",
    label: "Meet relevant members",
  },
  {
    action: "View gatherings",
    complete: false,
    description: "See the next event and carry the relationship forward.",
    href: "#gatherings",
    label: "Gather around the table",
  },
];

export function CommunityStartPath({
  cohortActive,
  state,
}: {
  cohortActive: boolean;
  state: CommunityStartPathState | null;
}) {
  const steps: StartStep[] = state
    ? [
        ...(cohortActive
          ? [
              {
                action: state.has_introduction
                  ? "Review introduction"
                  : "Introduce yourself",
                complete: state.has_introduction,
                description:
                  "Give the room enough context to understand what you are building, offering and seeking.",
                href: "#cohort-welcome-title",
                label: "Begin with context",
              },
            ]
          : []),
        {
          action: state.has_contribution
            ? "Return to conversations"
            : "Share with purpose",
          complete: state.has_contribution,
          description:
            "Add one focused Ask, Offer, useful resource or thoughtful reply.",
          href: "#conversations",
          label: "Contribute something useful",
        },
        {
          action: state.has_accepted_connection
            ? "Nurture relationships"
            : "Meet members",
          complete: state.has_accepted_connection,
          description:
            "Read her context first. Private conversation begins only after mutual acceptance.",
          href: state.has_accepted_connection ? "/network" : "#members",
          label: "Build one mutual connection",
        },
        ...(state.next_gathering_slug
          ? [
              {
                action: state.has_upcoming_registration
                  ? "View gathering"
                  : "Consider your place",
                complete: state.has_upcoming_registration,
                description: state.next_gathering_title
                  ? `${state.next_gathering_title} is the next gathering selected for this room.`
                  : "Carry useful community context into the next gathering.",
                href: `/events/${state.next_gathering_slug}`,
                label: "Continue around the table",
              },
            ]
          : []),
      ]
    : fallbackSteps;

  const recommended = steps.find((step) => !step.complete);
  const allComplete = state && !recommended;

  return (
    <section
      className="community-room-overview community-start-path"
      aria-labelledby="community-start-title"
    >
      <header>
        <p className="eyebrow">
          {allComplete ? "Your room rhythm" : "Recommended now"}
        </p>
        <h2 id="community-start-title">
          {allComplete
            ? "You have found your place here."
            : recommended?.label ?? "Begin where you are."}
        </h2>
        <p>
          {allComplete
            ? "Return when you have something useful to offer, a clear ask, or a relationship to nurture. There is no activity quota."
            : recommended?.description ??
              "Use this room for thoughtful context and practical support. Private conversations begin only after both members choose to connect."}
        </p>
        {recommended ? (
          <Link className="community-start-primary" href={recommended.href}>
            {recommended.action} <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <a className="community-start-primary" href="#conversations">
            Return to conversations <span aria-hidden="true">→</span>
          </a>
        )}
      </header>
      <div aria-label="Ways to participate in this community">
        {steps.map((step, index) => (
          <Link
            className={`${step.complete ? "is-complete" : ""} ${
              step === recommended ? "is-recommended" : ""
            }`}
            href={step.href}
            key={step.label}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.label}</strong>
            <small>{step.complete ? "Available whenever useful" : step.description}</small>
            <em>{step.complete ? "Established" : step.action}</em>
          </Link>
        ))}
      </div>
    </section>
  );
}
