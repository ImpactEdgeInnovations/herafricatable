"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunityJoinLimit = { community_id: string; maximum_members: number | null; waiting_list_enabled: boolean; occupied_members: number; is_full: boolean; on_waiting_list: boolean };
type WaitingMember = { user_id: string; display_name: string; joined_at: string };

export function CommunityCapacityPanel({communityId,owner}:{communityId:string;owner:boolean}) {
  const supabase=useMemo(()=>createClient(),[]);
  const router=useRouter();
  const {ask,dialog}=useActionDialog();
  const [limit,setLimit]=useState("");
  const [waitingEnabled,setWaitingEnabled]=useState(true);
  const [current,setCurrent]=useState<CommunityJoinLimit|null>(null);
  const [people,setPeople]=useState<WaitingMember[]>([]);
  const [loading,setLoading]=useState(true);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const lock=useRef(false);
  const generation=useRef(0);
  const load=useCallback(async()=>{
    const version=++generation.current;
    setLoading(true);setReady(false);
    try {
      const [limits,waiting]=await Promise.all([supabase.rpc("list_community_join_limits",{p_community_id:communityId}),supabase.rpc("list_community_waiting_members",{p_community_id:communityId})]);
      if(version!==generation.current)return;
      const row=(limits.data as CommunityJoinLimit[]|null)?.[0];
      if(limits.error||waiting.error||!row||!Array.isArray(waiting.data))throw Error("Member limits could not be loaded. Your current joining rules have not changed.");
      setCurrent(row);setLimit(row.maximum_members===null?"":String(row.maximum_members));setWaitingEnabled(row.waiting_list_enabled);setPeople(waiting.data);setReady(true);
    }catch(error){if(version===generation.current)setMessage(memberErrorMessage(error,"load member limits"));}
    finally{if(version===generation.current)setLoading(false);}
  },[communityId,supabase]);
  useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
  async function save(){
    if(lock.current||!owner||!ready)return;
    const maximum=limit.trim()?Number(limit):null;
    if(maximum!==null&&(!Number.isInteger(maximum)||maximum<2||maximum>100000)){setMessage("Choose at least 2 members, or leave the limit blank.");return;}
    lock.current=true;setBusy("save");setMessage("");
    try{const {error}=await supabase.rpc("save_community_join_limit",{p_community_id:communityId,p_maximum:maximum,p_waiting_list:waitingEnabled});if(error)throw error;await load();setMessage("Member limit saved. Existing members keep their places.");router.refresh();}
    catch(error){setMessage(memberErrorMessage(error,"save your member limit"));}finally{lock.current=false;setBusy("");}
  }
  async function review(person:WaitingMember,action:"approve"|"decline"){
    if(lock.current||!ready)return;
    lock.current=true;setBusy(person.user_id);setMessage("");
    try{
      const answer=await ask({title:action==="approve"?`Offer ${person.display_name} a place?`:`Decline ${person.display_name}’s request?`,description:action==="approve"?"A place must be available. Paid Communities still require payment before entry.":"Your explanation will be sent privately to this person, not posted in the Community.",confirmLabel:action==="approve"?"Approve place":"Decline request",tone:action==="decline"?"danger":"default",fields:action==="decline"?[{name:"reason",label:"Reason for declining",type:"textarea",required:true,minLength:5,maxLength:500}]:[]});
      if(!answer)return;
      const {error}=await supabase.rpc("review_community_waiting_member",{p_community_id:communityId,p_user_id:person.user_id,p_action:action,p_reason:answer.reason||null});if(error)throw error;
      await load();setMessage(action==="approve"?"Place approved. We’ve queued a private notification.":"Request declined. We’ve queued your private explanation.");router.refresh();
    }catch(error){setMessage(memberErrorMessage(error,"review this waiting-list request"));}finally{lock.current=false;setBusy("");}
  }
  return <section className="community-host-panel" id="member-limit" aria-labelledby="member-limit-title">
    <header><div><p className="eyebrow">Member places</p><h2 id="member-limit-title">Keep your Community the right size.</h2></div><p>A limit includes you, moderators and reserved paid places. Pending requests do not hold a place.</p></header>
    {loading?<p role="status">Loading member places…</p>:!ready?<button type="button" onClick={()=>void load()}>Try again</button>:<>
      <p>{current?.occupied_members} places occupied{current?.maximum_members!==null?` of ${current?.maximum_members}`:" · no limit"}.</p>
      {owner?<div className="community-host-invite"><label>Maximum members (optional)<input aria-label="Maximum members" type="number" min={2} max={100000} value={limit} onChange={e=>setLimit(e.target.value)} disabled={Boolean(busy)}/><small>Leave blank for no limit.</small></label><label><input type="checkbox" checked={waitingEnabled} onChange={e=>setWaitingEnabled(e.target.checked)} disabled={Boolean(busy)}/>Allow a waiting list when full</label><button type="button" className="button button-primary" disabled={Boolean(busy)} onClick={()=>void save()}>{busy==="save"?"Saving…":"Save member limit"}</button></div>:<p>Only the owner can change the limit. You can still review waiting members.</p>}
      <h3>Waiting for a place</h3>{!people.length?<p>No one is on the waiting list.</p>:<div className="community-host-member-list">{people.map(person=><article key={person.user_id}><strong>{person.display_name}</strong><div><button type="button" disabled={Boolean(busy)||current?.is_full} onClick={()=>void review(person,"approve")}>Approve place</button><button type="button" disabled={Boolean(busy)} onClick={()=>void review(person,"decline")}>Decline</button></div></article>)}</div>}
      {current?.is_full&&people.length?<p>All places are occupied. Increase the limit or free a place before approving someone.</p>:null}{people.length===100?<p>Showing the first 100 waiting members. Review these to see more.</p>:null}
    </>}{message?<p className="manager-message" role="status">{message}</p>:null}{dialog}
  </section>;
}
