"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

type Request = {order_id:string;display_name:string;requested_at:string;attendee_note:string|null};
type Waiting = {request_id:string;display_name:string;joined_at:string};
export function EventHostRequests({eventId}:{eventId:string}) {
  const client=useMemo(()=>createClient(),[]); const router=useRouter();const {ask,dialog}=useActionDialog();
  const [requests,setRequests]=useState<Request[]>([]);const [waiting,setWaiting]=useState<Waiting[]>([]);
  const [ready,setReady]=useState(false);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState("");const [message,setMessage]=useState("");
  const lock=useRef(false);const generation=useRef(0);
  const load=useCallback(async()=>{const version=++generation.current;setLoading(true);setReady(false);
    try{const [r,w]=await Promise.all([client.rpc("list_host_event_requests",{p_event_id:eventId}),client.rpc("list_host_event_waiting_members",{p_event_id:eventId})]);if(version!==generation.current)return;if(r.error||w.error||!Array.isArray(r.data)||!Array.isArray(w.data))throw Error("Guest requests could not be loaded. No booking has changed.");setRequests(r.data);setWaiting(w.data);setReady(true);}
    catch(error){if(version===generation.current)setMessage(memberErrorMessage(error,"load guest requests"));}finally{if(version===generation.current)setLoading(false);}
  },[client,eventId]);
  useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
  async function review(request:Request,action:"approve"|"reject") {
    if(lock.current||!ready)return;lock.current=true;setBusy(request.order_id);setMessage("");
    try{const answer=await ask({title:action==="approve"?`Confirm a place for ${request.display_name}?`:`Decline ${request.display_name}’s request?`,description:action==="approve"?"This confirms one free place. The guest will receive her private event pass.":"Your reason will be sent privately to the guest. Do not include payment details or information about other people.",confirmLabel:action==="approve"?"Confirm place":"Decline request",tone:action==="reject"?"danger":"default",fields:action==="reject"?[{name:"reason",label:"Reason for declining",type:"textarea",required:true,minLength:5,maxLength:500}]:[]});if(!answer)return;
      const {error}=await client.rpc("review_host_event_request",{p_order_id:request.order_id,p_action:action,p_reason:answer.reason||null});if(error)throw error;await load();setMessage(action==="approve"?"Place confirmed. We’ve queued the guest’s notification.":"Request declined. We’ve queued your explanation privately.");router.refresh();
    }catch(error){setMessage(memberErrorMessage(error,"review this event request"));}finally{lock.current=false;setBusy("");}
  }
  async function notify(person:Waiting){
    if(lock.current||!ready)return;lock.current=true;setBusy(person.request_id);setMessage("");
    try{if(!await ask({title:`Let ${person.display_name} know?`,description:"We’ll check that a free place is available, then send a private notification. This does not reserve a place or book for them.",confirmLabel:"Send place notice"}))return;
      const {error}=await client.rpc("notify_host_waitlisted_guest",{p_event_id:eventId,p_request_id:person.request_id});if(error)throw error;setMessage("Place notice queued. No seat has been reserved.");
    }catch(error){setMessage(memberErrorMessage(error,"send a place notice"));}finally{lock.current=false;setBusy("");}
  }
  return <section className="community-host-panel" aria-labelledby="host-guest-requests-title"><header><div><p className="eyebrow">Guest requests</p><h2 id="host-guest-requests-title">Choose who joins your event.</h2></div><p>Review free places here. Admin continues to handle payments and refunds.</p></header>
    {loading?<p role="status">Loading requests…</p>:!ready?<button type="button" onClick={()=>void load()}>Try again</button>:<>
      <h3>Waiting for your decision</h3>{requests.length?<div className="community-host-member-list">{requests.map(request=><article key={request.order_id}><div><strong>{request.display_name}</strong>{request.attendee_note?<p>{request.attendee_note}</p>:null}</div><div><button type="button" disabled={Boolean(busy)} onClick={()=>void review(request,"approve")}>Approve</button><button type="button" disabled={Boolean(busy)} onClick={()=>void review(request,"reject")}>Decline</button></div></article>)}</div>:<p>No free-place requests need a decision.</p>}
      <h3>Waiting for a place</h3>{waiting.length?<div className="community-host-member-list">{waiting.map(person=><article key={person.request_id}><strong>{person.display_name}</strong><button type="button" disabled={Boolean(busy)} onClick={()=>void notify(person)}>Let them know a place is available</button></article>)}</div>:<p>No one is on the waiting list.</p>}
      {requests.length===100||waiting.length===100?<p>Showing the first 100 in each list. Review these to see more.</p>:null}<p>People on the waiting list do not hold a seat. A place notice is sent only if bookings have reopened.</p>
    </>}{message?<p className="manager-message" role="status">{message}</p>:null}{dialog}</section>;
}
