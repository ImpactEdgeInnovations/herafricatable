import Link from "next/link";
import { InstallAppButton } from "@/components/pwa/install-app";
import { EventCountdown } from "@/components/event-countdown";
import type { CountdownEvent } from "@/lib/upcoming-countdown";
import type { LandingEvent, LandingEvents } from "@/lib/landing-events";
import { HeroMotionControl } from "./hero-motion-control";
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
  const joinSteps = [
    { title: "Confirm your email", text: "We’ll send a one-time code. No password to remember." },
    { title: "Tell us about you", text: "Your name, where you are and what you hope to find here." },
    openPilot ? { title: "Make yourself at home", text: "Complete your profile, find a Community and see what’s coming up." }
      : { title: "We’ll be in touch", text: "Our team reviews your request privately. We’ll email you when you can join." },
  ];
  return <main className={styles.page}>
      <header className={`${styles.container} ${styles.header}`}>
        <Wordmark />
        <nav className={styles.mainNav} aria-label="Explore Her Africa Table"><Link href="/events">Events</Link><a href="#community">Communities</a><a href="#membership">How to join</a></nav>
        <nav className={styles.accountNav} aria-label="Account navigation"><Link href="/sign-in">Sign in</Link><Link className={styles.joinSmall} href="/sign-in?mode=apply">Join the Table <Arrow /></Link></nav>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
        <div className={styles.floatingScene} aria-hidden="true">
          <div className={`${styles.floatingCard} ${styles.coffeeCard}`}><div className={styles.cardSurface}>
            <img src="/images/table-conversation.webp" alt="" width={1600} height={1040} fetchPriority="high" decoding="async" />
            <span>A little coffee.<br />A good conversation.</span>
          </div></div>
          <div className={`${styles.floatingCard} ${styles.ideasCard}`}><div className={styles.cardSurface}>
            <small>ROOM AT THE TABLE</small><strong>Good ideas.<br />New faces.</strong><span className={styles.orbitArt}><i /><i /><i /></span>
          </div></div>
          <div className={`${styles.floatingCard} ${styles.helloCard}`}><div className={styles.cardSurface}>
            <svg viewBox="0 0 100 100"><path d="M50 50C3 35 20-2 50 28C80-2 97 35 50 50C97 65 80 102 50 72C20 102 3 65 50 50Z" /><circle cx="50" cy="50" r="9" /></svg><strong>A new hello.</strong><small>A world of possibility.</small>
          </div></div>
          <div className={`${styles.floatingCard} ${styles.tableCard}`}><div className={styles.cardSurface}>
            <span>H</span><strong>Meet.<br />Connect.<br />Rise.</strong><small>HER AFRICA TABLE</small>
          </div></div>
          <span className={`${styles.sceneDot} ${styles.dotOne}`} /><span className={`${styles.sceneDot} ${styles.dotTwo}`} />
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><span aria-hidden="true" /> A place for African women</p>
          <h1 id="hero-title">Good company.<br /><em>Great things ahead.</em></h1>
          <p className={styles.heroDescription}>Find your people. Make a plan. Be part of a Community that feels like you.</p>
          <div className={styles.heroActions}><Link className={styles.primaryButton} href="/sign-in?mode=apply">Find your Table <Arrow /></Link><Link className={styles.textLink} href="/events">Explore events <Arrow /></Link></div>
          <p className={styles.heroOrigin}>Starting in Nairobi. Connecting across Africa.</p>
        </div>
        <HeroMotionControl className={styles.motionToggle} />
        </div>
      </section>

    <div className={styles.container}>
      {countdown ? <div className={styles.countdown}><EventCountdown initialEvent={countdown} /></div> : null}

      <section className={styles.events} aria-labelledby="events-title"><header className={styles.sectionHeading}><div><p className={styles.kicker}>Out of the group chat. Into your calendar.</p><h2 id="events-title">Something to look forward to.</h2></div><Link className={styles.textLink} href="/events">All events <Arrow /></Link></header>
        {listing.events.length ? <div className={styles.eventGrid}>{listing.events.map((event, index) => { const date = landingEventDate(event); return <article className={styles.eventCard} key={event.id}>
          <Link href={`/events/${event.slug}`} className={styles.eventImage} aria-label={`View ${event.title}`}>
            {event.image ? <img src={event.image.url} alt={event.image.alt} width={640} height={400} loading="lazy" decoding="async" /> : <div className={styles.eventArtwork} data-artwork={index % 3} aria-hidden="true"><span>Her Africa Table</span><strong>{index === 0 ? <>A seat<br />for you.</> : <>Meet.<br />Connect.<br />Rise.</>}</strong><small>{date.day} {date.month} {new Date(event.starts_at).getUTCFullYear()}</small><i>H</i></div>}
          </Link>
          <div className={styles.eventCardBody}><p className={styles.eventDate}><strong>{date.day}</strong> {date.month} <span>· {date.time}</span></p><p className={styles.eventFormat}>{event.format === "hybrid" ? "In person & online" : event.format === "virtual" || event.format === "online" ? "Online" : "In person"}</p><h3><Link href={`/events/${event.slug}`}>{event.title}</Link></h3><p className={styles.eventLocation}>{event.format === "virtual" || event.format === "online" ? "Join online" : [event.venues?.name, event.venues?.city].filter(Boolean).join(", ") || "See event details for the location"}</p><Link href={`/events/${event.slug}`} className={styles.cardAction}>View event <Arrow /></Link></div>
        </article>; })}</div> : <div className={styles.emptyEvents}><div><h3>{listing.unavailable ? "The calendar is taking a moment." : "Your next invitation is on its way."}</h3><p>{listing.unavailable ? "You can still open Events and try the calendar again." : "New dates will appear here when they’re ready."}</p></div><Link className={styles.textLink} href="/events">View events <Arrow /></Link></div>}
      </section>

      <section className={styles.community} id="community" aria-labelledby="community-title"><header className={styles.sectionHeading}><div><p className={styles.kicker}>More than a one-off hello</p><h2 id="community-title">Find your Community.</h2></div><p>A shared interest. A familiar place.<br />People you’ll want to see again.</p></header><div className={styles.communityGrid}>
        <Link href="/communities" className={styles.communityCard}><span className={styles.communityMark} aria-hidden="true">H</span><div><h3>Make yourself at home.</h3><p>Find a Community around something you enjoy. Ask, share and get to know each other.</p><span>Explore Communities <Arrow /></span></div></Link>
        <Link href="/network" className={styles.communityCard}><span className={styles.connectionMark} aria-hidden="true"><i /><i /></span><div><h3>Turn a hello into a connection.</h3><p>Meet members who are open to connecting. Share an introduction and take it from there.</p><span>Meet members <Arrow /></span></div></Link>
      </div><p className={styles.memberNote}>Sign in to see the Communities and profiles available to you.</p></section>

      <section className={styles.membership} id="membership" aria-labelledby="membership-title"><header><div><p className={styles.kicker}>A simple start</p><h2 id="membership-title">A hello is all it takes.</h2><p>{openPilot ? "Registration is open during our pilot. Confirm your email, share a few details and complete your profile—no approval wait." : "Membership requests are reviewed by our team. We’ll let you know by email when your place is ready."}</p></div><Link className={styles.primaryButton} href="/sign-in?mode=apply">Join Her Africa Table <Arrow /></Link></header><ol className={styles.joinSteps} aria-label="How membership works">{joinSteps.map((step, index) => <li key={step.title}><span>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol><p className={styles.alreadyMember}>Already a member? <Link href="/sign-in">Sign in</Link></p></section>

      <footer className={styles.footer}><div className={styles.footerTop}><Wordmark small /><nav aria-label="Helpful links"><Link href="/events">Events</Link><Link href="/faq">FAQs</Link><a href="mailto:support@herafricatable.com">Contact</a><InstallAppButton compact /></nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} Her Africa Table · Nairobi, Kenya</span><nav aria-label="Trust and policies"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/community-guidelines">Community guidelines</Link></nav></div></footer>
    </div>
  </main>;
}
