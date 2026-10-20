import Link from "next/link";
import { AuthPanel } from "@/components/auth/auth-panel";

export function AuthPage({
  destination,
  initialJourney,
  intent,
}: {
  destination?: string;
  initialJourney?: "apply" | "sign-in";
  intent: "member" | "admin";
}) {
  const isAdmin = intent === "admin";
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Her Africa Table membership">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
        </Link>
        <div className="story-copy">
          <p className="eyebrow">{isAdmin ? "Team sign in" : "Her Africa Table"}</p>
          <h1>{isAdmin ? <>A clear view.<br />A well-kept Table.</> : <>Good company.<br />New possibilities.</>}</h1>
          <p>{isAdmin ? "Use your approved team email to open your workspace." : "Meet women, find an event and keep the conversation going in your Community."}</p>
        </div>
        <p className="auth-quote">Starting in Nairobi. Connecting across Africa.</p>
      </section>
      <section className="auth-panel-wrap" aria-label={`${isAdmin ? "Team" : "Member"} sign in`}>
        <AuthPanel destination={destination} initialJourney={initialJourney} intent={intent} />
      </section>
    </main>
  );
}
