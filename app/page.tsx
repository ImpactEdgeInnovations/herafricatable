import Link from "next/link";

const ArrowIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" /></svg>
);

const ConnectionIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 32 32">
    <circle cx="11" cy="11" r="4" /><circle cx="23" cy="10" r="3" />
    <path d="M4 26c.7-5 3.1-7.4 7-7.4S17.3 21 18 26M18.3 18.7c1.2-1.1 2.8-1.7 4.7-1.7 3.2 0 5.1 2.1 5.7 6" />
  </svg>
);

const EventIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 32 32">
    <rect x="4" y="7" width="24" height="21" rx="3" />
    <path d="M10 3v8M22 3v8M4 14h24M10 20h4M18 20h4" />
  </svg>
);

const GrowthIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 32 32">
    <path d="M7 27V16M16 27V10M25 27V5M4 27h24" /><path d="m6 11 8-6 6 3 7-6" />
  </svg>
);

const ShieldIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 32 32">
    <path d="M16 3 27 7v8c0 7.4-4.2 11.8-11 14-6.8-2.2-11-6.6-11-14V7l11-4Z" />
    <path d="m11 16 3.2 3L21 12" />
  </svg>
);

const SparkIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 32 32">
    <path d="M16 3c.5 7.7 4.3 11.5 12 12-7.7.5-11.5 4.3-12 12-.5-7.7-4.3-11.5-12-12 7.7-.5 11.5-4.3 12-12Z" />
  </svg>
);

const principles = [
  ["01", "No business cards", "Scan, request, accept—and keep the relationship in one private place."],
  ["02", "Smart discovery", "Find women by industry, country, experience, interests, and what they need now."],
  ["03", "Useful every week", "Ask for an introduction, offer expertise, join a Circle, or learn something practical."],
  ["04", "Yours beyond the event", "Your connections, conversations, communities, and event memories stay with you."],
];

const faqs = [
  ["Is Her Africa Table only an event platform?", "No. Curated events are the front door and trust signal. The platform is the lasting network where members continue connecting, learning, sharing opportunities, and building relationships."],
  ["Who can join the private beta?", "The first beta is invitation and approval based. Ticket holders, approved founding members, and vouched applicants can enter. Signing in verifies identity; it does not automatically grant membership."],
  ["How is my contact information protected?", "Your public member card shows only professional profile information. Phone, email, and social links remain gated until you accept a connection. You can pause discovery or block a member at any time."],
  ["Do I need to download an app?", "No. Her Africa Table launches as a mobile-first web experience that works from your browser and can be saved to your home screen."],
  ["What happens if online payments are unavailable?", "Admin can switch an event to manual review. Your registration is recorded, verified by the team, and grants the same membership access after approval."],
];

export default function HomePage() {
  return (
    <main className="site-shell">
      <div className="beta-strip">
        <span>Founding beta</span>
        <p>First gathering: Nairobi · Event details shared with approved members</p>
        <Link href="/sign-in">Request access <ArrowIcon /></Link>
      </div>

      <header className="site-header">
        <Link className="brand" href="/" aria-label="Her Africa Table home">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="About Her Africa Table">
          <a href="#why">Why the table</a>
          <a href="#experience">The experience</a>
          <a href="#membership">Membership</a>
          <a href="#questions">Questions</a>
        </nav>
        <nav className="header-actions" aria-label="Account navigation">
          <Link className="text-link admin-link" href="/admin/sign-in">Admin</Link>
          <Link className="button button-small button-outline" href="/sign-in">Member sign in</Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> The table is being set</p>
          <h1 id="hero-title">Your seat.<br /><em>Your network.</em><br />Your next chapter.</h1>
          <p className="hero-intro">A private professional network where African women turn meaningful introductions into lasting relationships, opportunities, and growth.</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/sign-in">Enter the beta <ArrowIcon /></Link>
            <a className="text-link" href="#membership">See how membership works</a>
          </div>
          <div className="trust-row" aria-label="Membership qualities">
            <span>Curated membership</span><span>Private by design</span><span>Built for connection</span>
          </div>
        </div>

        <div className="table-visual" aria-label="An abstract round table representing connection">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="table-top"><span className="table-monogram">HAT</span><span className="table-subtitle">A seat changes everything</span></div>
          <div className="seat seat-one"><span>01</span></div><div className="seat seat-two"><span>02</span></div>
          <div className="seat seat-three"><span>03</span></div><div className="seat seat-four"><span>04</span></div>
          <div className="seat seat-five"><span>05</span></div><div className="seat seat-six"><span>06</span></div>
          <p className="visual-note">Designed around real conversations—not follower counts.</p>
        </div>
      </section>

      <section className="promise-section" id="why" aria-labelledby="promise-title">
        <div className="section-heading">
          <p className="eyebrow">Beyond the event</p>
          <h2 id="promise-title">The room may close.<br />The network stays open.</h2>
        </div>
        <p className="section-lead">Events are where trust begins. Her Africa Table is where the connection keeps working—before the next gathering and long after the last conversation.</p>
        <div className="value-grid">
          <article className="value-card"><ConnectionIcon /><span>01</span><h3>Find your people</h3><p>Discover members by industry, expertise, country, and what they are building next.</p></article>
          <article className="value-card featured-card"><EventIcon /><span>02</span><h3>Connect with intention</h3><p>Turn a conversation at the table into a trusted, permission-based professional connection.</p></article>
          <article className="value-card"><GrowthIcon /><span>03</span><h3>Keep moving forward</h3><p>Ask, offer, learn, share opportunities, and grow with women invested in your progress.</p></article>
        </div>
      </section>

      <section className="nairobi-section" aria-labelledby="nairobi-title">
        <div className="event-art" aria-hidden="true">
          <span className="event-ring ring-a" /><span className="event-ring ring-b" />
          <div className="event-city"><small>Founding city</small><strong>Nairobi</strong><span>Kenya</span></div>
          <p>One table · Many industries · Shared ambition</p>
        </div>
        <div className="event-copy">
          <p className="eyebrow">The first gathering</p>
          <h2 id="nairobi-title">A carefully chosen room in Nairobi.</h2>
          <p>The first Her Africa Table event will bring together women whose work, perspective, and generosity can move one another forward. Approved members receive the date, venue, programme, and ticket window first.</p>
          <dl className="event-details">
            <div><dt>Format</dt><dd>Curated professional gathering</dd></div>
            <div><dt>Access</dt><dd>Invitation and approval</dd></div>
            <div><dt>Details</dt><dd>Announced to beta members</dd></div>
          </dl>
          <Link className="button button-primary" href="/sign-in">Join the Nairobi beta <ArrowIcon /></Link>
        </div>
      </section>

      <section className="principles-section" aria-labelledby="principles-title">
        <div className="compact-heading">
          <p className="eyebrow">Made to be useful</p>
          <h2 id="principles-title">Professional networking,<br />made more human.</h2>
        </div>
        <div className="principle-list">
          {principles.map(([number, title, description]) => (
            <article className="principle-row" key={number}>
              <span>{number}</span><h3>{title}</h3><p>{description}</p><ArrowIcon />
            </article>
          ))}
        </div>
      </section>

      <section className="platform-section" id="experience" aria-labelledby="platform-title">
        <div className="platform-copy">
          <p className="eyebrow light-eyebrow">Inside your network</p>
          <h2 id="platform-title">A reason to return—even when no event is near.</h2>
          <p>Your home brings the network into focus: who to meet, what members need, what you can offer, and what is happening next.</p>
          <ul className="platform-features">
            <li><ConnectionIcon /><span><b>Trusted directory</b>Search across events without exposing private contact details.</span></li>
            <li><SparkIcon /><span><b>Asks & Offers</b>Make a specific request or open a door for someone else.</span></li>
            <li><EventIcon /><span><b>Circles and communities</b>Build momentum in smaller, relevant groups.</span></li>
          </ul>
        </div>
        <div className="product-preview" aria-label="Illustrative preview of the member home">
          <div className="preview-top"><div className="mini-brand">H</div><span>Good evening, Amina</span><i /></div>
          <div className="preview-body">
            <div className="preview-welcome"><small>YOUR NEXT GATHERING</small><strong>Nairobi</strong><span>Details arriving soon</span><div><b>—</b><small>DAYS</small><b>—</b><small>HOURS</small></div></div>
            <div className="preview-section-title"><b>From the network</b><span>See all</span></div>
            <div className="preview-ask"><span className="preview-avatar">AM</span><div><b>Looking for an introduction</b><p>Seeking women building in climate finance across East Africa.</p><small>ASK · FINANCE</small></div></div>
            <div className="preview-ask offer"><span className="preview-avatar">NK</span><div><b>Offering two mentorship sessions</b><p>For early-stage founders preparing their first institutional raise.</p><small>OFFER · FOUNDERS</small></div></div>
            <div className="preview-nav"><span>Home</span><span>Network</span><span>Connect</span><span>Inbox</span><span>More</span></div>
          </div>
        </div>
      </section>

      <section className="trust-section" aria-labelledby="trust-title">
        <div className="trust-emblem"><ShieldIcon /><span>Trust is a product feature</span></div>
        <div className="trust-copy">
          <p className="eyebrow">Private by design</p>
          <h2 id="trust-title">You decide who gets closer.</h2>
          <p>Membership creates access to a professional network—not automatic access to your private information. Every deeper connection remains permission-based.</p>
          <div className="trust-points">
            <article><strong>01</strong><h3>Contact details stay gated</h3><p>Email, phone, and social links appear only after you accept a connection.</p></article>
            <article><strong>02</strong><h3>Pause without losing your network</h3><p>Step out of discovery while keeping your existing connections and history.</p></article>
            <article><strong>03</strong><h3>Reporting without standing surveillance</h3><p>Moderators see private content only when a report requires investigation—and access is logged.</p></article>
          </div>
        </div>
      </section>

      <section className="membership-section" id="membership" aria-labelledby="membership-title">
        <div><p className="eyebrow light-eyebrow">Membership, simply</p><h2 id="membership-title">One invitation.<br />A network that compounds.</h2></div>
        <ol className="membership-steps">
          <li><strong>01</strong><span><b>Join the beta</b>Sign in with Google or a secure email code.</span></li>
          <li><strong>02</strong><span><b>Complete your profile</b>Share enough for the right women to find you.</span></li>
          <li><strong>03</strong><span><b>Take your seat</b>Enter the event, directory, and trusted network.</span></li>
        </ol>
        <Link className="button button-light" href="/sign-in">Request beta access <ArrowIcon /></Link>
      </section>

      <section className="founding-section" aria-labelledby="founding-title">
        <div className="founder-mark">“</div>
        <blockquote>
          <p id="founding-title">We are building the room we wanted to find: ambitious without being transactional, private without being closed, and useful long after everyone goes home.</p>
          <footer>— A note from the founding team</footer>
        </blockquote>
        <div className="founding-note"><span>Founding member stories</span><p>Authentic member voices, event photography, and partner marks will be added here after consent—not fabricated for launch.</p></div>
      </section>

      <section className="faq-section" id="questions" aria-labelledby="faq-title">
        <div className="faq-heading"><p className="eyebrow">Good questions</p><h2 id="faq-title">Before you take your seat.</h2><p>Still need help? <a href="mailto:support@herafricatable.com">Speak with the team.</a></p></div>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary><span>{String(index + 1).padStart(2, "0")}</span>{question}<i>+</i></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="closing-section" aria-labelledby="closing-title">
        <p className="eyebrow light-eyebrow">Your invitation starts here</p>
        <h2 id="closing-title">The next opportunity may already be sitting at the table.</h2>
        <p>Join the private beta and be among the first women shaping Her Africa Table in Nairobi.</p>
        <div><Link className="button button-light" href="/sign-in">Request beta access <ArrowIcon /></Link><a href="mailto:support@herafricatable.com">Ask us a question</a></div>
      </section>

      <footer className="site-footer complete-footer">
        <div className="footer-intro">
          <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></div>
          <p>A private professional network for African women, beginning in Nairobi.</p>
        </div>
        <div className="footer-column"><strong>Explore</strong><a href="#why">Why the table</a><a href="#experience">The experience</a><a href="#membership">Membership</a><a href="#questions">Questions</a></div>
        <div className="footer-column"><strong>Account</strong><Link href="/sign-in">Member sign in</Link><Link href="/admin/sign-in">Admin sign in</Link><a href="mailto:support@herafricatable.com">Support</a></div>
        <div className="footer-column"><strong>Trust</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/community-guidelines">Community guidelines</Link></div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} Her Africa Table</span><span>Built with intention in Nairobi.</span></div>
      </footer>
    </main>
  );
}

