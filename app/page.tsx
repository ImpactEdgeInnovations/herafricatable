import Link from "next/link";
import { InstallAppButton } from "@/components/pwa/install-app";
import {
  EventCountdown,
  type CountdownEvent,
} from "@/components/event-countdown";
import { getSupabasePublicEnv } from "@/lib/env";

export const revalidate = 60;

const ArrowIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20">
    <path d="M4 10h11m-4-4 4 4-4 4" />
  </svg>
);

const tableExperiences = [
  {
    number: "01",
    label: "Meet",
    title: "Begin in the room",
    description:
      "Join thoughtful gatherings designed for useful conversations, not hurried networking.",
  },
  {
    number: "02",
    label: "Belong",
    title: "Find your circle",
    description:
      "Continue inside a Community built around a place, purpose or shared ambition.",
  },
  {
    number: "03",
    label: "Build",
    title: "Move something forward",
    description:
      "Ask for help, share an opportunity and make introductions with mutual consent.",
  },
];

const membershipSteps = [
  ["01", "Confirm your email", "We send a private one-time code."],
  ["02", "Tell us about you", "Share a few details about your work and purpose."],
  ["03", "Private review", "Our membership team considers every request."],
  ["04", "Take your seat", "Complete your profile and enter the network."],
];

function formatEventDate(value: string | undefined) {
  if (!value) return { day: "Soon", month: "Date to be shared" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { day: "Soon", month: "Date to be shared" };
  }
  return {
    day: new Intl.DateTimeFormat("en-KE", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("en-KE", {
      month: "long",
      year: "numeric",
    }).format(date),
  };
}

async function getPublishedCountdown(): Promise<CountdownEvent | null> {
  try {
    const { url, publishableKey } = getSupabasePublicEnv();
    const response = await fetch(
      `${url}/rest/v1/site_event_countdown?id=eq.true&is_published=eq.true&select=event_name,city,starts_at&limit=1`,
      {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
        },
        next: { revalidate },
      },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as CountdownEvent[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const countdown = await getPublishedCountdown();
  const eventDate = formatEventDate(countdown?.starts_at);

  return (
    <main className="site-shell editorial-home">
      <header className="site-header editorial-header">
        <Link className="brand" href="/" aria-label="Her Africa Table home">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="Explore Her Africa Table">
          <a href="#inside">Inside the table</a>
          <Link href="/events">Gatherings</Link>
          <Link href="/faq">Questions</Link>
        </nav>
        <nav className="header-actions" aria-label="Account navigation">
          <Link className="editorial-sign-in" href="/sign-in">Sign in</Link>
          <Link className="button button-small button-primary" href="/sign-in?mode=apply">
            Request membership
          </Link>
        </nav>
      </header>

      <section className="editorial-hero" aria-labelledby="hero-title">
        <div className="editorial-hero-copy">
          <p className="eyebrow"><span /> Private membership · Nairobi</p>
          <h1 id="hero-title">
            Where African women<br />
            gather <em>with purpose.</em>
          </h1>
          <p>
            Meet women doing meaningful work, then keep the right relationships
            growing beyond the room.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/sign-in?mode=apply">
              Request membership <ArrowIcon />
            </Link>
            <Link className="text-link" href="/events">Explore gatherings</Link>
          </div>
          <div className="editorial-proof" aria-label="Membership qualities">
            <span>Carefully selected</span>
            <span>Private by design</span>
            <span>Relationships with purpose</span>
          </div>
        </div>

        <div className="editorial-live-preview" aria-label="A preview of life inside Her Africa Table">
          <header>
            <div>
              <span className="editorial-live-pulse" aria-hidden="true" />
              <strong>Inside the Table</strong>
            </div>
            <small>Founding pilot · Nairobi</small>
          </header>
          <Link className="editorial-live-event" href="/events">
            <span className="editorial-live-date">
              <strong>{eventDate.day}</strong>
              <small>{eventDate.month}</small>
            </span>
            <span>
              <small>Next gathering · {countdown?.city ?? "Nairobi"}</small>
              <strong>{countdown?.event_name ?? "The next Table gathering"}</strong>
              <em>View details <ArrowIcon /></em>
            </span>
          </Link>
          <div className="editorial-live-capabilities">
            <article>
              <span>Communities</span>
              <strong>Find your circle</strong>
              <small>Purpose-led spaces for conversation and gatherings.</small>
            </article>
            <article>
              <span>Introductions</span>
              <strong>Meet with consent</strong>
              <small>Your private details stay private until both women agree.</small>
            </article>
          </div>
          <footer>
            <span>Events</span><i aria-hidden="true" />
            <span>Communities</span><i aria-hidden="true" />
            <span>Introductions</span>
          </footer>
        </div>
      </section>

      <EventCountdown initialEvent={countdown} />

      <section className="editorial-experience" id="inside" aria-labelledby="inside-title">
        <header>
          <div>
            <p className="eyebrow light-eyebrow">What happens at the table</p>
            <h2 id="inside-title">Meet once.<br />Keep building together.</h2>
          </div>
          <p>
            An event starts the relationship. Her Africa Table gives it a calm,
            private place to become useful—with clear boundaries at every step.
          </p>
        </header>
        <div className="editorial-experience-grid">
          {tableExperiences.map((experience) => (
            <article key={experience.number}>
              <header><span>{experience.number}</span><small>{experience.label}</small></header>
              <h3>{experience.title}</h3>
              <p>{experience.description}</p>
            </article>
          ))}
        </div>
        <div className="editorial-product-window" aria-label="Member experience preview">
          <header>
            <span className="mini-brand">H</span>
            <div><small>Your member space</small><strong>A calm place to return to</strong></div>
            <span className="editorial-window-private">Private</span>
          </header>
          <div>
            <article><span>01</span><p><strong>Your Communities</strong><small>Return to the people and conversations you chose.</small></p></article>
            <article><span>02</span><p><strong>Your gatherings</strong><small>Prepare, attend and follow up in one place.</small></p></article>
            <article><span>03</span><p><strong>Your introductions</strong><small>Connect only when both women are comfortable.</small></p></article>
          </div>
          <footer>
            <strong>You decide who gets closer.</strong>
            <Link href="/community-guidelines">How we protect the Table <ArrowIcon /></Link>
          </footer>
        </div>
      </section>

      <section className="editorial-invitation" id="membership" aria-labelledby="membership-title">
        <div className="editorial-invitation-copy">
          <p className="eyebrow light-eyebrow">Private membership</p>
          <h2 id="membership-title">Bring your work.<br />Find your people.</h2>
          <p>
            Request a place in the Nairobi founding circle. Your answers are
            reviewed privately and we will email you when your seat is ready.
          </p>
          <div>
            <Link className="button button-light" href="/sign-in?mode=apply">
              Request membership <ArrowIcon />
            </Link>
            <a href="mailto:support@herafricatable.com">Ask us a question</a>
          </div>
        </div>
        <ol aria-label="How membership works">
          {membershipSteps.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <p><strong>{title}</strong><small>{description}</small></p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="site-footer complete-footer editorial-footer">
        <div className="footer-signature">
          <div className="brand footer-brand">
            <span className="brand-mark" aria-hidden="true">H</span>
            <span>Her Africa Table<small>Private membership · Nairobi</small></span>
          </div>
          <p>Meet. Connect. Rise.</p>
          <span>A trusted place for African women to build relationships that continue beyond the room.</span>
        </div>
        <div className="footer-navigation">
          <nav aria-label="Explore Her Africa Table">
            <Link href="/events">Events</Link>
            <Link href="/faq">Questions</Link>
            <Link href="/sign-in">Membership</Link>
            <InstallAppButton compact />
            <a href="mailto:support@herafricatable.com">Contact</a>
          </nav>
          <nav aria-label="Trust and policies">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/community-guidelines">Community guidelines</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Her Africa Table</span>
          <span>Nairobi, Kenya · Limited founding pilot</span>
        </div>
      </footer>
    </main>
  );
}
