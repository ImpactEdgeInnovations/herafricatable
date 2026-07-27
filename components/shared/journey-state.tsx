import Link from "next/link";

type JourneyAction = {
  href: string;
  label: string;
  primary?: boolean;
};

type JourneyStateProps = {
  actions?: JourneyAction[];
  description: string;
  eyebrow?: string;
  title: string;
  variant?: "empty" | "error" | "loading";
};

export function JourneyState({
  actions = [],
  description,
  eyebrow,
  title,
  variant = "empty",
}: JourneyStateProps) {
  const isLoading = variant === "loading";

  return (
    <section
      className={`journey-state journey-state-${variant}`}
      aria-busy={isLoading || undefined}
      aria-live={isLoading ? "polite" : undefined}
      role={variant === "error" ? "alert" : isLoading ? "status" : undefined}
    >
      <span className="journey-state-mark" aria-hidden="true">
        {isLoading ? <i /> : variant === "error" ? "!" : "H"}
      </span>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
        {isLoading ? (
          <div className="journey-state-progress" aria-hidden="true">
            <span />
          </div>
        ) : null}
        {actions.length ? (
          <div className="journey-state-actions">
            {actions.map((action) => (
              <Link
                className={
                  action.primary
                    ? "button button-primary"
                    : "button button-outline"
                }
                href={action.href}
                key={`${action.href}-${action.label}`}
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
