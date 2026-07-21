"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type SupportTicket = { id:string; reference:string; category:string; subject:string; description:string; status:string; priority:string; assigned_to:string|null; created_at:string; updated_at:string };
export type SupportMessage = { id:string; ticket_id:string; author_id:string; body:string; is_staff:boolean; created_at:string };

const categories=["account","registration","payment","event","safety","privacy","technical","other"];
const label=(value:string)=>value.replaceAll("_"," ");
const date=(value:string)=>new Intl.DateTimeFormat("en-KE",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value));

export function SupportCenter({currentUserId,tickets,messages,selectedTicketId}:{currentUserId:string;tickets:SupportTicket[];messages:SupportMessage[];selectedTicketId:string|null}) {
  const supabase=useMemo(()=>createClient(),[]);const router=useRouter();
  const [category,setCategory]=useState("account");const [subject,setSubject]=useState("");const [description,setDescription]=useState("");const [reply,setReply]=useState("");const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");
  const selected=tickets.find(ticket=>ticket.id===selectedTicketId)??null;
  useEffect(()=>{if(!selectedTicketId)return;const channel=supabase.channel(`support:${selectedTicketId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"support_messages",filter:`ticket_id=eq.${selectedTicketId}`},()=>router.refresh()).subscribe();return()=>{void supabase.removeChannel(channel)}},[router,selectedTicketId,supabase]);
  async function createTicket(event:FormEvent){event.preventDefault();setBusy(true);setNotice("");const {data,error}=await supabase.rpc("create_support_ticket",{p_category:category,p_description:description,p_subject:subject});setBusy(false);if(error){setNotice(error.message);return}setSubject("");setDescription("");router.push(`/support?ticket=${data}`);router.refresh()}
  async function sendReply(event:FormEvent){event.preventDefault();if(!selectedTicketId||!reply.trim())return;setBusy(true);setNotice("");const {error}=await supabase.rpc("reply_support_ticket",{p_body:reply,p_ticket_id:selectedTicketId});setBusy(false);if(error){setNotice(error.message);return}setReply("");router.refresh()}
  return <div className="support-shell">
    <aside className="support-sidebar"><header><p className="eyebrow">Private support</p><h1>Help centre</h1><p>Requests are visible only to you and the authorized support team.</p></header>
      <details className="support-new" open={!tickets.length}><summary>New support request</summary><form onSubmit={createTicket}><label>Category<select value={category} onChange={event=>setCategory(event.target.value)}>{categories.map(item=><option key={item} value={item}>{label(item)}</option>)}</select></label><label>Subject<input minLength={5} maxLength={160} required value={subject} onChange={event=>setSubject(event.target.value)}/></label><label>What happened?<textarea minLength={10} maxLength={4000} rows={5} required value={description} onChange={event=>setDescription(event.target.value)}/></label><button className="button button-primary" disabled={busy}>{busy?"Sending…":"Submit request"}</button></form></details>
      <div className="support-ticket-list">{tickets.map(ticket=><Link className={ticket.id===selectedTicketId?"selected":""} href={`/support?ticket=${ticket.id}`} key={ticket.id}><span><strong>{ticket.subject}</strong><small>{ticket.reference} · {label(ticket.category)}</small></span><b className={`support-state ${ticket.status}`}>{label(ticket.status)}</b></Link>)}</div>
    </aside>
    <section className="support-panel">{selected?<><header><div><p className="eyebrow">{selected.reference} · {label(selected.category)}</p><h2>{selected.subject}</h2></div><span className={`support-state ${selected.status}`}>{label(selected.status)}</span></header><div className="support-thread"><article className="support-opening"><div><strong>You opened this request</strong><p>{selected.description}</p><time>{date(selected.created_at)}</time></div></article>{messages.map(message=><article className={message.author_id===currentUserId?"own":"staff"} key={message.id}><div><strong>{message.is_staff?"Her Africa Table support":"You"}</strong><p>{message.body}</p><time>{date(message.created_at)}</time></div></article>)}</div>{selected.status!=="closed"?<form className="support-composer" onSubmit={sendReply}><label><span className="sr-only">Reply</span><textarea rows={3} maxLength={4000} required value={reply} onChange={event=>setReply(event.target.value)} placeholder="Add a private reply…"/></label><button className="button button-primary" disabled={busy||!reply.trim()}>{busy?"Sending…":"Send reply"}</button></form>:<p className="support-closed">This request is closed. Open a new request if you need more help.</p>}</>:<div className="conversation-placeholder"><p className="eyebrow">Here when you need us</p><h2>Select a request.</h2><p>Account, payment, event, privacy and safety support all begin here.</p></div>}{notice?<p className="message-status" role="status">{notice}</p>:null}</section>
  </div>
}
