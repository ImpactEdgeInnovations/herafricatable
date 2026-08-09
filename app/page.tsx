import Link from "next/link";
import { EventCountdown } from "@/components/event-countdown";

const ArrowIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20">
    <path d="M4 10h11m-4-4 4 4-4 4" />
  </svg>
);

const membershipBenefits = [
  {
    number: "01",
    title: "Meet the right women",
    description:
      "Find women through what they are building, what they know and what they need now.",
  },
  {
    number: "02",
    title: "Stay connected",
    description:
      "Continue a good event conversation privately, with permission on both sides.",
  },
  {
    number: "03",
    title: "Move work forward",
    description:
      "Ask for help, share an opportunity or bring women together around a clear purpose.",
  },
];

const membershipSteps = [
  ["01", "Verify your email", "Receive a private six-digit sign-in code."],
  ["02", "Tell us about you", "Share a few details about your work and purpose."],
  ["03", "Thoughtful review", "Our membership team considers every request privately."],
  ["04", "Take your seat", "Complete your profile and enter the member network."],
];

export default function HomePage() {
  return (
    <main className="site-shell editorial-home">
      <header className="site-header editorial-header">
        <Link className="brand" href="/" aria-label="Her Africa Table home">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="About Her Africa Table">
          <a href="#why">Why join</a>
          <a href="#inside">Inside the table</a>
          <Link href="/events">Events</Link>
          <Link href="/faq">FAQ</Link>
        </nav>
        <nav className="header-actions" aria-label="Account navigation">
          <Link className="editorial-sign-in" href="/sign-in">Sign in</Link>
          <Link className="button button-small button-primary" href="/sign-in">
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
            A private membership network for African women who lead, build,
            invest and create—with relationships that continue beyond the room.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/sign-in">
              Request membership <ArrowIcon />
            </Link>
            <Link className="text-link" href="/events">View gatherings</Link>
          </div>
          <div className="editorial-proof" aria-label="Membership qualities">
            <span>Carefully selected</span>
            <span>Private by design</span>
            <span>Built for real connection</span>
          </div>
        </div>

        <div className="editorial-table-art" aria-label="Her Africa Table founding circle in Nairobi">
          <div className="editorial-art-top"><span>Founding circle</span><span>01 / Nairobi</span></div>
          <div className="editorial-art-centre">
            <i aria-hidden="true" />
            <strong>HAT</strong>
            <p>A seat changes<br />everything.</p>
          </div>
          <div className="editorial-art-bottom"><span>Women shaping Africa</span><span>Est. 2026</span></div>
        </div>
      </section>

      <EventCountdown />

      <section className="editorial-purpose" id="why" aria-labelledby="purpose-title">
        <header>
          <p className="eyebrow">Why the table exists</p>
          <h2 id="purpose-title">A network built for useful relationships.</h2>
        </header>
        <p className="editorial-purpose-intro">
          Events create the first moment. Her Africa Table gives the relationship
          a private place to grow—without unwanted access or public pressure.
        </p>
        <div className="editorial-benefits">
          {membershipBenefits.map((benefit) => (
            <article key={benefit.number}>
              <span>{benefit.number}</span>
              <h3>{benefit.title}</h3>
              <p>{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="editorial-community" id="inside" aria-labelledby="inside-title">
        <div className="editorial-community-copy">
          <p className="eyebrow light-eyebrow">Inside the table</p>
          <h2 id="inside-title">Your people, in one calm place.</h2>
          <p>
            Return to the women and conversations you chose. Share an ask,
            offer help, plan a gathering or continue work together.
          </p>
          <ul>
            <li><span>01</span><p><strong>Your Communities first</strong><small>Return directly to the women and conversations you chose.</small></p></li>
            <li><span>02</span><p><strong>You stay in control</strong><small>Your contact details stay private until you accept a connection.</small></p></li>
            <li><span>03</span><p><strong>Useful, not noisy</strong><small>Clear conversations, gatherings and introductions without the clutter.</small></p></li>
          </ul>
          <Link className="button button-light" href="/sign-in">Request your seat <ArrowIcon /></Link>
        </div>

        <div className="editorial-community-preview" aria-label="Illustrative preview of a Her Africa Table Community">
          <header><span className="mini-brand">H</span><p><small>Your Community</small><strong>The Founding Table</strong></p><i /></header>
          <div className="editorial-preview-welcome">
            <small>GOOD MORNING, AMINA</small>
            <strong>What would move your work forward today?</strong>
            <span>Start a conversation</span>
          </div>
          <div className="editorial-preview-row">
            <span>MN</span><p><strong>Looking for a climate finance introduction</strong><small>ASK · NAIROBI · 12 MIN AGO</small></p>
          </div>
          <div className="editorial-preview-row">
            <span>AK</span><p><strong>Offering two founder office hours this month</strong><small>OFFER · FOUNDERS · TODAY</small></p>
          </div>
          <footer><span>Home</span><span>Community</span><span>Members</span><span>Messages</span></footer>
        </div>
      </section>

      <section className="editorial-trust" aria-labelledby="trust-title">
        <div>
          <p className="eyebrow">Private by design</p>
          <h2 id="trust-title">You decide who gets closer.</h2>
        </div>
        <p>
          Membership never gives someone your private information. You choose
          which connections to accept, and our team can step in when support is needed.
        </p>
        <Link href="/community-guidelines">How we protect the table <ArrowIcon /></Link>
      </section>

      <section className="editorial-membership" id="membership" aria-labelledby="membership-title">
        <header>
          <p className="eyebrow">Membership, clearly</p>
          <h2 id="membership-title">Joining is simple.</h2>
          <p>No complicated setup. No public application. Your answers are reviewed privately.</p>
        </header>
        <ol>
          {membershipSteps.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <p><strong>{title}</strong><small>{description}</small></p>
            </li>
          ))}
        </ol>
      </section>

      <section className="editorial-closing" aria-labelledby="closing-title">
        <p className="eyebrow light-eyebrow">The Nairobi founding circle</p>
        <h2 id="closing-title">Bring your work.<br />Find your people.</h2>
        <p>Request membership and help shape the table from its first chapter.</p>
        <div>
          <Link className="button button-light" href="/sign-in">Request membership <ArrowIcon /></Link>
          <a href="mailto:support@herafricatable.com">Ask us a question</a>
        </div>
      </section>

      <footer className="site-footer complete-footer editorial-footer">
        <div className="footer-intro">
          <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></div>
          <p>A private professional Community for African women, beginning in Nairobi.</p>
        </div>
        <div className="footer-column"><strong>Explore</strong><a href="#why">Why join</a><a href="#inside">Inside the table</a><Link href="/events">Events</Link><Link href="/faq">FAQ</Link></div>
        <div className="footer-column"><strong>Account</strong><Link href="/sign-in">Member sign in</Link><Link href="/admin/sign-in">Admin sign in</Link><a href="mailto:support@herafricatable.com">Support</a></div>
        <div className="footer-column"><strong>Trust</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/community-guidelines">Community guidelines</Link></div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} Her Africa Table</span><span>Built with intention in Nairobi.</span></div>
      </footer>
    </main>
  );
}
