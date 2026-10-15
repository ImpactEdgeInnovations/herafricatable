"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";
import { useActionDialog } from "@/components/ui/action-dialog";
import { parseInvitationEmails } from "@/lib/invitation-emails";

export type DestinationInvitation = {
  created_at: string; expires_at: string | null; invitation_id: string;
  invitation_status: string; invitee_email: string; personal_note: string | null;
  delivery_status?: string; delivery_attempts?: number;
};
type BatchResult = {invitation_id:string|null;invitee_email:string;invitation_status:string;created:boolean;error_message:string|null};
const statusCopy:Record<string,string>={claimed:"Continued to join",expired:"Expired",joined:"Joined or requested access",membership_pending:"Finishing membership",opened:"Opened",pending_review:"Awaiting team review",rejected:"Not approved",revoked:"Revoked",sent:"Invitation open"};
const deliveryCopy:Record<string,string>={sent:"Email sent",queued:"Email waiting to send",processing:"Sending email",failed:"Email failed — contact support",suppressed:"Email not sent",not_sent:"Email not sent"};

export function DestinationInvitationPanel({destinationId,currentUserId,destinationName,destinationType,invitations,ready}:{destinationId:string;currentUserId:string;destinationName:string;destinationType:"community"|"event";invitations:DestinationInvitation[];ready:boolean}) {
  const router=useRouter();const supabase=useMemo(()=>createClient(),[]);const {ask,dialog}=useActionDialog();
  const [busy,setBusy]=useState(false);const lock=useRef(false);const [message,setMessage]=useState("");
  const [history,setHistory]=useState(invitations);const [results,setResults]=useState<BatchResult[]>([]);const [showAll,setShowAll]=useState(false);
  const [draft,setDraft,clearDraft]=useCommunityDraft(communityDraftKey(currentUserId,`${destinationType}-invitation`,destinationId),{email:"",note:"",preset:""});
  const parsed=parseInvitationEmails(draft.email);const dirty=Boolean(draft.email||draft.note||draft.preset);
  useEffect(()=>{setHistory(invitations);},[invitations]);
  const noteIdeas=destinationType==="event"?[{label:"A warm invitation",text:`I thought you would enjoy ${destinationName}. It would be lovely to see you there.`},{label:"Meet people together",text:`Would you join me at ${destinationName}? I would love for us to meet new people together.`}]:[{label:"A warm invitation",text:`I thought you would feel at home in ${destinationName}. I would love to welcome you.`},{label:"Shared interest",text:"This Community brings together women with a shared interest. I thought of you and hope you will join us."}];
  async function refreshHistory(){
    const result=await supabase.rpc("list_my_table_invitation_delivery",{p_destination_id:destinationId,p_destination_type:destinationType});
    if(result.error||!Array.isArray(result.data))throw result.error||Error("Delivery status could not be loaded.");
    setHistory(result.data as DestinationInvitation[]);
  }
  async function checkDelivery(){if(lock.current)return;lock.current=true;setBusy(true);setMessage("");try{await refreshHistory();setMessage("Delivery status updated. Email sent means our email provider accepted it; check spam or promotions if it is missing.");}catch(error){setMessage(memberErrorMessage(error,"check invitation delivery"));}finally{lock.current=false;setBusy(false);}}
  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(lock.current||!ready)return;
    if(!parsed.emails.length||parsed.invalid.length||parsed.tooMany){setMessage("Add up to 20 valid email addresses before sending.");return;}
    const submitted={...draft};const emails=[...parsed.emails];lock.current=true;setBusy(true);setMessage("");
    try{
      if(!await ask({title:`Invite ${emails.length===1?"one person":`${emails.length} people`} to ${destinationName}?`,description:`Each person receives a separate invitation. Email addresses are not shared with the other recipients. ${submitted.note.trim()?"Your note will be included in each invitation.":"We will include a short welcome message."} Existing invitations will not be sent twice.`,confirmLabel:emails.length===1?"Send invitation":`Send ${emails.length} invitations`}))return;
      const {data,error}=await supabase.rpc("create_table_invitation_batch",{p_destination_id:destinationId,p_destination_type:destinationType,p_emails:emails,p_personal_note:submitted.note.trim()||null});
      if(error)throw error;
      if(!Array.isArray(data)||data.length!==emails.length)throw Error("We could not confirm every invitation. Check recent invitations before trying again.");
      const rows=data as BatchResult[];setResults(rows);
      const failed=rows.filter(row=>!row.invitation_id);const saved=rows.filter(row=>row.invitation_id);
      clearDraft({email:failed.map(row=>row.invitee_email).join(", "),note:failed.length?submitted.note:"",preset:failed.length?submitted.preset:""});
      const ids=saved.filter(row=>row.invitation_status==="sent").map(row=>row.invitation_id);
      let sent=0;
      if(ids.length){try{const response=await fetch("/api/member/invitations/deliver",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({invitationIds:ids})});const delivery=await response.json();if(response.ok)sent=Number(delivery.sent)||0;}catch{/* Saved jobs remain available for scheduled delivery. */}}
      try{await refreshHistory();}catch{/* Individual saved outcomes are still shown honestly below. */}
      const review=saved.filter(row=>row.invitation_status==="pending_review").length;
      setMessage(`${saved.length} invitation${saved.length===1?"":"s"} saved. ${sent?`${sent} email${sent===1?"":"s"} sent. `:""}${review?`${review} awaiting team review. `:""}${failed.length?`${failed.length} could not be saved; their addresses remain in the box.`:"Check Recent invitations for each email’s delivery status."}`);
      router.refresh();
    }catch(error){setMessage(memberErrorMessage(error,"send these invitations"));}finally{lock.current=false;setBusy(false);}
  }
  return <section className="destination-invitation-panel" id="invite-people">
    <header><div><p className="eyebrow">Invite people</p><h2>Bring people to {destinationName}.</h2></div><p>New visitors confirm their email and join Her Africa Table first. {destinationType==="event"?"They then book their event place.":"Your Community’s joining rules still apply."}</p></header>
    {!ready?<div className="destination-invitation-preparing" role="status"><strong>Invitations are unavailable just now.</strong><p>Refresh this page or contact support if this continues.</p></div>:<div className="destination-invitation-layout">
      <form onSubmit={event=>void send(event)}>
        <label>Email addresses<textarea autoComplete="off" disabled={busy} maxLength={7000} name="email" value={draft.email} onChange={event=>setDraft(current=>({...current,email:event.target.value}))} placeholder="amina@example.com, grace@example.com" required rows={3} aria-describedby="invitation-address-help"/></label>
        <small id="invitation-address-help">Paste addresses separated by commas or new lines. Each invitation is private. Up to 20 in 24 hours.</small>
        {parsed.emails.length?<div className="invitation-address-preview" aria-label="Invitation recipients"><small>{parsed.emails.length} {parsed.emails.length===1?"person":"people"}{parsed.duplicates?` · ${parsed.duplicates} duplicate${parsed.duplicates===1?"":"s"} removed`:""}</small><div>{parsed.emails.map(email=><span key={email} className={parsed.invalid.includes(email)?"is-invalid":""}>{email}</span>)}</div></div>:null}
        {parsed.invalid.length?<p role="status">Check: {parsed.invalid.join(", ")}. Use email addresses only, without names.</p>:null}
        {parsed.tooMany?<p role="status">Choose no more than 20 people in this batch.</p>:null}
        <label>Start with a note <small>Optional</small><select disabled={busy} value={draft.preset} onChange={event=>{const selected=event.target.value;setDraft(current=>({...current,preset:selected,note:noteIdeas.find(idea=>idea.label===selected)?.text??""}));}}><option value="">Write my own</option>{noteIdeas.map(idea=><option key={idea.label} value={idea.label}>{idea.label}</option>)}</select></label>
        <label>Your message <small>Sent to each person</small><textarea disabled={busy} maxLength={600} minLength={10} name="note" placeholder="I thought you would enjoy joining us…" rows={3} value={draft.note} onChange={event=>setDraft(current=>({...current,note:event.target.value,preset:""}))}/></label>
        <button className="button button-primary" disabled={busy||!parsed.emails.length||parsed.invalid.length>0||parsed.tooMany}>{busy?"Preparing invitations…":"Review & send"}</button>
        {dirty?<p className="invitation-draft-note">Not sent yet. <button type="button" disabled={busy} onClick={()=>clearDraft({email:"",note:"",preset:""})}>Clear</button></p>:null}
        <small>We do not upload your address book or share addresses between recipients.</small>
      </form>
      <div className="destination-invitation-history"><div><strong>Recent invitations</strong><button type="button" disabled={busy} onClick={()=>void checkDelivery()}>Refresh status</button></div>
        <div className="invitation-history-list" tabIndex={0} aria-label="Recent invitation delivery">{history.length?history.slice(0,showAll?50:6).map(invitation=><article key={invitation.invitation_id}><div><strong>{invitation.invitee_email}</strong><small>{new Intl.DateTimeFormat("en-KE",{day:"numeric",month:"short"}).format(new Date(invitation.created_at))} · {statusCopy[invitation.invitation_status]||"In progress"}</small></div><span data-status={invitation.delivery_status}>{invitation.invitation_status==="pending_review"?"Not emailed yet":deliveryCopy[invitation.delivery_status??""]||"Delivery not confirmed"}</span></article>):<p>Your invitations and their email status will appear here.</p>}</div>
        {history.length>6?<button type="button" onClick={()=>setShowAll(value=>!value)}>{showAll?"Show fewer":"Show all recent invitations"}</button>:null}
        <small>“Email sent” means the email provider accepted it, not that it reached the inbox. Ask her to check Spam or Promotions.</small>
        {results.some(row=>row.error_message)?<div role="status">{results.filter(row=>row.error_message).map(row=><p key={row.invitee_email}><strong>{row.invitee_email}</strong> — {row.error_message}</p>)}</div>:null}
      </div>
    </div>}{message?<p className="community-host-message" role="status">{message}</p>:null}{dialog}
  </section>;
}
