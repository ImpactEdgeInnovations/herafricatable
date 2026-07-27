"use client";

import Link from "next/link";

type RouteErrorProps = {
  homeHref: string;
  homeLabel: string;
  reset: () => void;
  supportHref: string;
  title: string;
};

export function RouteError({
  homeHref,
  homeLabel,
  reset,
  supportHref,
  title,
}: RouteErrorProps) {
  return (
    <main className="route-state-page">
      <section className="journey-state journey-state-error" role="alert">
        <span className="journey-state-mark" aria-hidden="true">
          !
        </span>
        <div>
          <p className="eyebrow">A temporary interruption</p>
          <h1>{title}</h1>
          <p>
            Your information is safe. Try loading this area again. If the
            interruption continues, contact support and tell us what you were
            trying to do.
          </p>
          <div className="journey-state-actions">
            <button
              className="button button-primary"
              onClick={reset}
              type="button"
            >
              Try again
            </button>
            <Link className="button button-outline" href={homeHref}>
              {homeLabel}
            </Link>
            <Link className="journey-state-support" href={supportHref}>
              Contact support
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
