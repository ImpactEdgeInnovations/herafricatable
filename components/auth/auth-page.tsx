import Link from "next/link";
import { AuthPanel } from "@/components/auth/auth-panel";

export function AuthPage({ intent }: { intent: "member" | "admin" }) {
  const isAdmin = intent === "admin";
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Her Africa Table membership">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
        </Link>
        <div className="story-copy">
          <p className="eyebrow">{isAdmin ? "Protecting the table" : "Welcome to the table"}</p>
          <h1>{isAdmin ? <>Thoughtful access.<br />Trusted stewardship.</> : <>A trusted room<br />changes what&apos;s<br />possible.</>}</h1>
          <p>{isAdmin ? "Administration is restricted to approved team members and every sensitive action is recorded." : "Join a private network built for meaningful introductions, practical opportunity, and relationships that last beyond the event."}</p>
        </div>
        <p className="auth-quote">“When women gather with intention, possibility becomes practical.”</p>
      </section>
      <section className="auth-panel-wrap" aria-label={`${isAdmin ? "Admin" : "Member"} authentication`}>
        <AuthPanel intent={intent} />
      </section>
    </main>
  );
}
