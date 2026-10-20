import Link from "next/link";
import { InstallAppButton } from "@/components/pwa/install-app";
import { EventCountdown } from "@/components/event-countdown";
import type { CountdownEvent } from "@/lib/upcoming-countdown";
import type { LandingEvent, LandingEvents } from "@/lib/landing-events";
import styles from "./landing-page.module.css";

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 10h13m-5-5 5 5-5 5" /></svg>;
}

export function landingEventDate(event: LandingEvent) {
  let timeZone = event.timezone || "Africa/Nairobi";
  try { new Intl.DateTimeFormat("en-KE", { timeZone }).format(); } catch { timeZone = "Africa/Nairobi"; }
  return {
    date: new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "long", timeZone }).format(new Date(event.starts_at)),
    time: new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(event.starts_at)),
    day: new Intl.DateTimeFormat("en-KE", { day: "2-digit", timeZone }).format(new Date(event.starts_at)),
    month: new Intl.DateTimeFormat("en-KE", { month: "short", timeZone }).format(new Date(event.starts_at)),
  };
}

function Wordmark({ small = false }: { small?: boolean }) {
  return <Link href="/" className={`${styles.wordmark} ${small ? styles.smallWordmark : ""}`} aria-label="Her Africa Table home"><span aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></Link>;
}

export function LandingPage({ openPilot, countdown, listing }: { openPilot: boolean; countdown: CountdownEvent | null; listing: LandingEvents }) {
  const featured = listing.events[0];
  const next = featured ? landingEventDate(featured) : null;
  const joinSteps = [
    { title: "Confirm your email", text: "We’ll send a one-time code. No password to remember." },
    { title: "Tell us about you", text: "Your name, where you are and what you hope to find here." },
    openPilot ? { title: "Make yourself at home", text: "Complete your profile, find a Community and see what’s coming up." }
      : { title: "We’ll be in touch", text: "Our team reviews your request privately. We’ll email you when you can join." },
  ];
  return <main className={styles.page}>
    <div className={styles.container}>
      <header className={styles.header}>
        <Wordmark />
        <nav className={styles.mainNav} aria-label="Explore Her Africa Table"><Link href="/events">Events</Link><a href="#community">Communities</a><a href="#membership">How to join</a></nav>
        <nav className={styles.accountNav} aria-label="Account navigation"><Link href="/sign-in">Sign in</Link><Link className={styles.joinSmall} href="/sign-in?mode=apply">Join the Table <Arrow /></Link></nav>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><span aria-hidden="true" /> Your people are here</p>
          <h1 id="hero-title">Meet at the Table.<br /><em>Make it your own.</em></h1>
          <p className={styles.heroDescription}>A community for African women. Find your next event, people who share your interests, and conversations worth coming back to.</p>
          <div className={styles.heroActions}><Link className={styles.primaryButton} href="/sign-in?mode=apply">Join the Table <Arrow /></Link><Link className={styles.textLink} href="/events">Explore events <Arrow /></Link></div>
          <div className={styles.heroOrigin}><span aria-hidden="true">H</span><p>Made for African women.<br /><strong>Starting in Nairobi. Connecting across Africa.</strong></p></div>
        </div>
        <div className={styles.heroVisual}>
          <figure className={styles.heroPhoto}><img src="/images/table-conversation.webp" alt="Two women sharing coffee and a conversation" width={1600} height={1040} fetchPriority="high" decoding="async" /></figure>
          {featured && next ? <Link className={styles.nextEvent} href={`/events/${featured.slug}`} aria-label={`Next event: ${featured.title}`}>
            <span className={styles.dateStamp}><strong>{next.day}</strong><small>{next.month}</small></span>
            <span><small>Next at the Table</small><strong>A reason to meet.</strong><span>{next.date} · {next.time}</span></span><Arrow />
          </Link> : <div className={styles.photoNote}><span aria-hidden="true">H</span><p>A place to meet.<br /><strong>A reason to stay.</strong></p></div>}
        </div>
      </section>

      {countdown ? <div className={styles.countdown}><EventCountdown initialEvent={countdown} /></div> : null}

      <section className={styles.events} aria-labelledby="events-title"><header className={styles.sectionHeading}><div><p className={styles.kicker}>Make a plan</p><h2 id="events-title">See what’s coming up.</h2></div><Link className={styles.textLink} href="/events">All events <Arrow /></Link></header>
        {listing.events.length ? <div className={styles.eventGrid}>{listing.events.map((event, index) => { const date = landingEventDate(event); return <article className={styles.eventCard} key={event.id}>
          <Link href={`/events/${event.slug}`} className={styles.eventImage} aria-label={`View ${event.title}`}>
            {event.image ? <img src={event.image.url} alt={event.image.alt} width={640} height={400} loading="lazy" decoding="async" /> : <div className={styles.eventArtwork} data-artwork={index % 3} aria-hidden="true"><span>Her Africa Table</span><strong>{index === 0 ? <>A seat<br />for you.</> : <>Meet.<br />Connect.<br />Rise.</>}</strong><small>{date.day} {date.month} {new Date(event.starts_at).getUTCFullYear()}</small><i>H</i></div>}
          </Link>
          <div className={styles.eventCardBody}><p className={styles.eventDate}><strong>{date.day}</strong> {date.month} <span>· {date.time}</span></p><p className={styles.eventFormat}>{event.format === "hybrid" ? "In person & online" : event.format === "virtual" || event.format === "online" ? "Online" : "In person"}</p><h3><Link href={`/events/${event.slug}`}>{event.title}</Link></h3><p className={styles.eventLocation}>{event.format === "virtual" || event.format === "online" ? "Join online" : [event.venues?.name, event.venues?.city].filter(Boolean).join(", ") || "See event details for the location"}</p><Link href={`/events/${event.slug}`} className={styles.cardAction}>View event <Arrow /></Link></div>
        </article>; })}</div> : <div className={styles.emptyEvents}><div><h3>{listing.unavailable ? "The calendar is taking a moment." : "Your next invitation is on its way."}</h3><p>{listing.unavailable ? "You can still open Events and try the calendar again." : "New dates will appear here when they’re ready."}</p></div><Link className={styles.textLink} href="/events">View events <Arrow /></Link></div>}
      </section>

      <section className={styles.community} id="community" aria-labelledby="community-title"><header className={styles.sectionHeading}><div><p className={styles.kicker}>The conversation continues</p><h2 id="community-title">Find your Community.</h2></div><p>People who share a place, an interest,<br />or an idea worth exploring.</p></header><div className={styles.communityGrid}>
        <Link href="/communities" className={styles.communityCard}><span className={styles.communityMark} aria-hidden="true">H</span><div><h3>Make yourself at home.</h3><p>Find a Community around something you enjoy. Ask, share and get to know each other.</p><span>Explore Communities <Arrow /></span></div></Link>
        <Link href="/network" className={styles.communityCard}><span className={styles.connectionMark} aria-hidden="true"><i /><i /></span><div><h3>Turn a hello into a connection.</h3><p>Meet members who are open to connecting. Share an introduction and take it from there.</p><span>Meet members <Arrow /></span></div></Link>
      </div><p className={styles.memberNote}>Sign in to see the Communities and profiles available to you.</p></section>

      <section className={styles.membership} id="membership" aria-labelledby="membership-title"><header><div><p className={styles.kicker}>A simple start</p><h2 id="membership-title">A hello is all it takes.</h2><p>{openPilot ? "Registration is open during our pilot. Confirm your email, share a few details and complete your profile—no approval wait." : "Membership requests are reviewed by our team. We’ll let you know by email when your place is ready."}</p></div><Link className={styles.primaryButton} href="/sign-in?mode=apply">Join Her Africa Table <Arrow /></Link></header><ol className={styles.joinSteps} aria-label="How membership works">{joinSteps.map((step, index) => <li key={step.title}><span>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol><p className={styles.alreadyMember}>Already a member? <Link href="/sign-in">Sign in</Link></p></section>

      <footer className={styles.footer}><div className={styles.footerTop}><Wordmark small /><nav aria-label="Helpful links"><Link href="/events">Events</Link><Link href="/faq">FAQs</Link><a href="mailto:support@herafricatable.com">Contact</a><InstallAppButton compact /></nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} Her Africa Table · Nairobi, Kenya</span><nav aria-label="Trust and policies"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/community-guidelines">Community guidelines</Link></nav></div></footer>
    </div>
  </main>;
}
