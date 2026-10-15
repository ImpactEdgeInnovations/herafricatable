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
  const eventDate = featured ? landingEventDate(featured) : null;
  const joinSteps = [
    { title: "Confirm your email", text: "Sign in with a one-time code sent to your inbox. No password to remember." },
    { title: "Tell us about you", text: "Share your name, where you are and what you hope to find here." },
    openPilot ? { title: "Make yourself at home", text: "Complete your profile, find a Community and see what’s coming up." }
      : { title: "We’ll be in touch", text: "Our team reviews your request privately. We’ll email you when you can join." },
  ];
  return <main className={styles.page}>
    <div className={styles.container}>
      <header className={styles.header}>
        <Wordmark />
        <nav className={styles.mainNav} aria-label="Explore Her Africa Table">
          <Link href="/events">Events</Link><a href="#community">Communities</a><a href="#membership">How to join</a>
        </nav>
        <nav className={styles.accountNav} aria-label="Account navigation"><Link href="/sign-in">Sign in</Link><Link className={styles.joinSmall} href="/sign-in?mode=apply">Join the Table <Arrow /></Link></nav>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><span aria-hidden="true" /> A community for African women</p>
          <h1 id="hero-title">A place to meet.<br /><em>A reason to stay.</em></h1>
          <p className={styles.heroDescription}>Meet women, share ideas and support each other. Start with an event. Stay for the conversations, connections and people who understand you.</p>
          <div className={styles.heroActions}><Link className={styles.primaryButton} href="/sign-in?mode=apply">Join Her Africa Table <Arrow /></Link><Link className={styles.textLink} href="/events">Explore events <Arrow /></Link></div>
          <p className={styles.locationNote}>Starting in Nairobi. Connecting across Africa.</p>
        </div>
        <aside className={styles.featured} aria-label={featured ? "Coming up at the Table" : "Welcome to Her Africa Table"}>
          <div className={styles.featuredHeading}><span>{featured ? "On the calendar" : "You belong at the table"}</span><span>Her Africa Table / 01</span></div>
          {featured ? <Link className={styles.eventInvitation} href={`/events/${featured.slug}`}>
            {featured.image ? <div className={styles.poster}><img src={featured.image.url} alt={featured.image.alt} width={540} height={360} fetchPriority="high" /></div> : <div className={styles.eventArtwork} aria-hidden="true"><span>HER AFRICA TABLE</span><strong>Good people.<br /><i>Real connections.</i></strong><span>{featured.format === "virtual" || featured.format === "online" ? "ONLINE" : featured.venues?.city || "LET’S MEET"}</span></div>}
            <div className={styles.eventCaption}><p>{eventDate?.date} <span>·</span> {eventDate?.time}</p><h2>{featured.title}</h2><div><small>{featured.format === "virtual" || featured.format === "online" ? "Online" : [featured.venues?.name, featured.venues?.city].filter(Boolean).join(", ") || "See event details for the location"}</small><span className={styles.eventArrow} aria-label="View event details"><Arrow /></span></div></div>
          </Link> : <div className={styles.welcomeArtwork}><span>MEET. CONNECT. RISE.</span><strong>Her<br /><i>Africa</i><br />Table.</strong><p>There’s a place for you here.</p></div>}
          {!featured ? <p className={styles.eventNote}>{listing.unavailable ? "The event preview couldn’t load. You can still explore the event calendar." : "See the calendar for new dates and past events."} <Link href="/events">View events <span aria-hidden="true">↗</span></Link></p> : null}
        </aside>
      </section>

      {countdown ? <div className={styles.countdown}><EventCountdown initialEvent={countdown} /></div> : null}

      {listing.events.length > 1 ? <section className={styles.moreEvents} aria-labelledby="more-events-title"><header><h2 id="more-events-title">More to look forward to</h2><Link className={styles.textLink} href="/events">All events <Arrow /></Link></header><div>{listing.events.slice(1).map(event => { const date = landingEventDate(event); return <Link key={event.id} className={styles.eventRow} href={`/events/${event.slug}`}><span className={styles.dateStamp}><strong>{date.day}</strong><small>{date.month}</small></span><span><strong>{event.title}</strong><small>{date.date} · {date.time}</small></span><Arrow /></Link>; })}</div></section> : null}

      <section className={styles.community} id="community" aria-labelledby="community-title">
        <div className={styles.sectionIntro}><p className={styles.kicker}>Beyond the event</p><h2 id="community-title">The best part?<br /><em>You keep in touch.</em></h2><p>A good conversation doesn’t have to end when the event does. Your Community is a place to ask, share, meet again and get to know each other.</p><Link className={styles.textLink} href="/communities">Explore member Communities <Arrow /></Link><small>Sign in to see the Communities you can join.</small></div>
        <ol className={styles.communityList}>
          <li><span>01</span><div><h3>Find a Community that feels like you.</h3><p>Connect around a place, an interest or something you’re working towards.</p></div></li>
          <li><span>02</span><div><h3>Join the conversation.</h3><p>Ask a question, share something useful or drop into a Community meetup.</p></div></li>
          <li><span>03</span><div><h3>Turn a hello into a connection.</h3><p>Send an introduction. Choose who you connect with, and keep your conversations going.</p></div></li>
        </ol>
      </section>

      <section className={styles.membership} id="membership" aria-labelledby="membership-title">
        <header><div><p className={styles.kicker}>Your place at the Table</p><h2 id="membership-title">Come as you are.<br /><em>Start with a hello.</em></h2></div><div className={styles.membershipAction}><p>{openPilot ? "Registration is open during our pilot. Confirm your email, share a few details and complete your profile—no approval wait." : "Membership requests are reviewed by our team. We’ll let you know by email when your place is ready."}</p><Link className={styles.primaryButton} href="/sign-in?mode=apply">Join Her Africa Table <Arrow /></Link><span>Already a member? <Link href="/sign-in">Sign in</Link></span></div></header>
        <ol className={styles.joinSteps} aria-label="How membership works">{joinSteps.map((step, index) => <li key={step.title}><span>0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerTop}><Wordmark small /><nav aria-label="Helpful links"><Link href="/events">Events</Link><Link href="/faq">FAQs</Link><a href="mailto:support@herafricatable.com">Contact</a><InstallAppButton compact /></nav></div>
        <div className={styles.footerBottom}><span>© {new Date().getFullYear()} Her Africa Table · Nairobi, Kenya</span><nav aria-label="Trust and policies"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/community-guidelines">Community guidelines</Link></nav></div>
      </footer>
    </div>
  </main>;
}
