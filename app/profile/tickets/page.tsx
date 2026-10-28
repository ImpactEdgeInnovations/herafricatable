import Link from "next/link";
import {redirect} from "next/navigation";
import {MemberHeader} from "@/components/member/member-header";
import {createClient} from "@/lib/supabase/server";
import styles from "./tickets.module.css";
export const dynamic="force-dynamic";
type TicketRow={event_slug:string;event_title:string;starts_at:string;ends_at:string;timezone:string;status:string};
export default async function MyTickets({searchParams}:{searchParams:Promise<{page?:string}>}){
  const client=await createClient();const {data:{user}}=await client.auth.getUser();
  if(!user)redirect("/sign-in?next=%2Fprofile%2Ftickets");
  const query=await searchParams;
  const page=Math.min(1000,Math.max(1,Number.parseInt(query.page??"1",10)||1));
  const {data,error}=await client.rpc("list_my_event_tickets",{p_offset:(page-1)*12});
  const rows=(data??[]) as TicketRow[];
  return <main className="profile-page"><MemberHeader active="account" label="My tickets"/>
    <section className={styles.shell}>
      <Link className={styles.back} href="/profile">← Your profile</Link>
      <header className={styles.heading}><p className="eyebrow">Your plans</p><h1>My tickets</h1><p>Your confirmed places, ready to view or download. Keep each ticket private.</p></header>
      {error?<div role="alert" className={styles.empty}><h2>Your tickets could not load</h2><p>Your bookings have not changed. Please try again.</p><Link className="button button-outline" href={`/profile/tickets?page=${page}`}>Try again</Link></div>
        : rows.length?<><div className={styles.list}>{rows.slice(0,12).map(ticket=>{
          const ended=Date.parse(ticket.ends_at)<Date.now();
          return <article className={styles.ticket} key={ticket.event_slug}>
            <div><span className={styles.status}>{ended?"Past event":ticket.status==="attended"?"Checked in":"Confirmed"}</span><h2>{ticket.event_title}</h2><p>{new Intl.DateTimeFormat("en-KE",{dateStyle:"medium",timeStyle:"short",timeZone:ticket.timezone}).format(new Date(ticket.starts_at))} · {ticket.timezone.split("/").at(-1)?.replaceAll("_"," ")}</p></div>
            <div className={styles.actions}><Link className="button button-outline" href={`/events/${ticket.event_slug}/pass`}>View ticket</Link><a className="button button-primary" href={`/events/${ticket.event_slug}/ticket.pdf`} download>Download PDF</a></div>
          </article>;
        })}</div><nav className={styles.pages} aria-label="Ticket pages">{page>1?<Link className="button button-outline" href={`/profile/tickets?page=${page-1}`}>Previous</Link>:null}<span>Page {page}</span>{rows.length>12&&page<1000?<Link className="button button-outline" href={`/profile/tickets?page=${page+1}`}>Next</Link>:null}</nav></>
        :<div className={styles.empty}><h2>{page>1?"No more tickets":"No confirmed tickets yet"}</h2><p>{page>1?"Return to the previous page to see your saved places.":"Once an event booking is confirmed, your ticket will appear here."}</p><Link className="button button-primary" href={page>1?`/profile/tickets?page=${page-1}`:"/events"}>{page>1?"Previous page":"Find an event"}</Link></div>}
    </section>
  </main>;
}
