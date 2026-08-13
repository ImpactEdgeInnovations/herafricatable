import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function MembershipWaitingRoom({
  displayName,
  email,
  status,
  submittedAt,
}: {
  displayName: string | null;
  email: string;
  status: "in_review" | "submitted" | null;
  submittedAt: string | null;
}) {
  const firstName = displayName?.trim().split(/\s+/)[0] || "there";
  const hasRequest = status !== null;
  const inReview = status === "in_review";

  return (
    <main className="membership-waiting-page">
      <header className="membership-waiting-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Membership request</small></span>
        </Link>
        <div>
          <span>{email}</span>
          <SignOutButton className="membership-waiting-sign-out" />
        </div>
      </header>

      <section className="membership-waiting-shell" aria-labelledby="membership-waiting-title">
        <div className="membership-waiting-copy">
          <p className="eyebrow">
            {hasRequest ? "Membership request under review" : "Email confirmed"}
          </p>
          <h1 id="membership-waiting-title">
            {hasRequest
              ? `Thank you, ${firstName}. Your request is with us.`
              : `Welcome, ${firstName}. One short step remains.`}
          </h1>
          <p>
            {hasRequest
              ? "Your email is verified and your request remains private. Our membership team will email you as soon as a decision is made."
              : "Your email is verified. Complete the short private request so our membership team can consider your place at the table."}
          </p>

          <div className="membership-waiting-actions">
            {hasRequest ? (
              <>
                {status === "submitted" ? (
                  <Link className="button button-outline" href="/apply?edit=1">
                    Update my request
                  </Link>
                ) : null}
                <Link className="button button-primary" href="/events">
                  Explore public events
                </Link>
              </>
            ) : (
              <Link className="button button-primary" href="/apply">
                Complete my request
              </Link>
            )}
            <Link className="membership-waiting-help" href="/support">
              Ask the membership team
            </Link>
          </div>
        </div>

        <aside className="membership-waiting-status" aria-label="Membership request progress">
          <p className="eyebrow">Your progress</p>
          <ol>
            <li className="is-complete">
              <span aria-hidden="true">✓</span>
              <div><strong>Email confirmed</strong><small>Your sign-in email belongs to you.</small></div>
            </li>
            <li className={hasRequest ? "is-complete" : "is-current"}>
              <span aria-hidden="true">{hasRequest ? "✓" : "2"}</span>
              <div><strong>Request received</strong><small>A few private details about you and your purpose.</small></div>
            </li>
            <li className={hasRequest ? "is-current" : ""}>
              <span aria-hidden="true">3</span>
              <div>
                <strong>{inReview ? "Private review underway" : "Private team review"}</strong>
                <small>Only the Her Africa Table membership team can see your answers.</small>
              </div>
            </li>
          </ol>
          {hasRequest ? (
            <div className="membership-waiting-time">
              <span>Pilot response target</span>
              <strong>Within 2 business days</strong>
              {submittedAt ? (
                <small>
                  Received {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(submittedAt))}
                </small>
              ) : null}
            </div>
          ) : null}
        </aside>
      </section>

      <footer className="membership-waiting-footer">
        <p>
          Member profiles, Communities and private conversations open only after approval and profile setup.
        </p>
        <div><Link href="/privacy">Privacy</Link><Link href="/community-guidelines">Community guidelines</Link></div>
      </footer>
    </main>
  );
}
