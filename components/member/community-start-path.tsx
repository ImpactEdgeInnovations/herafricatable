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
    action: "View posts",
    complete: false,
    description: "Ask a question, share an update or offer something useful.",
    href: "#conversations",
    label: "Join a conversation",
  },
  {
    action: "Meet members",
    complete: false,
    description: "View member profiles and choose someone relevant to meet.",
    href: "#members",
    label: "Meet a member",
  },
  {
    action: "View events",
    complete: false,
    description: "See what is coming up for this community.",
    href: "#gatherings",
    label: "Join an event",
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
                  ? "View your introduction"
                  : "Introduce yourself",
                complete: state.has_introduction,
                description:
                  "Tell members who you are, what you are working on and what support would help.",
                href: "#cohort-welcome-title",
                label: "Introduce yourself",
              },
            ]
          : []),
        {
          action: state.has_contribution
            ? "View conversations"
            : "Write a post",
          complete: state.has_contribution,
          description:
            "Ask a clear question, share an update or offer useful support.",
          href: "#conversations",
          label: "Join a conversation",
        },
        {
          action: state.has_accepted_connection
            ? "View your connections"
            : "Meet members",
          complete: state.has_accepted_connection,
          description:
            "Read a member’s profile first. You can message after you both agree to connect.",
          href: state.has_accepted_connection ? "/network" : "#members",
          label: "Meet a member",
        },
        ...(state.next_gathering_slug
          ? [
              {
                action: state.has_upcoming_registration
                  ? "View event"
                  : "View event details",
                complete: state.has_upcoming_registration,
                description: state.next_gathering_title
                  ? `${state.next_gathering_title} is the next event for this community.`
                  : "See the next event chosen for this community.",
                href: `/events/${state.next_gathering_slug}`,
                label: "Join the next event",
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
          {allComplete ? "You’re all set" : "Your next step"}
        </p>
        <h2 id="community-start-title">
          {allComplete
            ? "Keep in touch when it matters."
            : recommended?.label ?? "Choose where to begin."}
        </h2>
        <p>
          {allComplete
            ? "Come back when you want to ask, share, meet someone or join an event. You never have to post just to stay active."
            : recommended?.description ??
              "Use this community to ask questions, share useful ideas and meet members. Private messages open only after both people agree to connect."}
        </p>
        {recommended ? (
          <Link className="community-start-primary" href={recommended.href}>
            {recommended.action} <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <a className="community-start-primary" href="#conversations">
            View community posts <span aria-hidden="true">→</span>
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
            <small>{step.complete ? "You have completed this step." : step.description}</small>
            <em>{step.complete ? "Done" : step.action}</em>
          </Link>
        ))}
      </div>
    </section>
  );
}
