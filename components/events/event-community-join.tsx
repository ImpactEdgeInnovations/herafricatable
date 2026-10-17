"use client";
import Link from "next/link";
import {useMemo,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {memberErrorMessage} from "@/lib/member-error";
import {useActionDialog} from "@/components/ui/action-dialog";

export function EventCommunityJoin({communityId,slug,activeMember,signedIn,initialStatus,joinPolicy}: {
  communityId:string;slug:string;activeMember:boolean;signedIn:boolean;initialStatus:string|null;joinPolicy:string|null;
}) {
  const client=useMemo(()=>createClient(),[]);const router=useRouter();
  const [status,setStatus]=useState(initialStatus);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const joining=useRef(false);const {ask,clearDraft,dialog}=useActionDialog({retainDrafts:true});
  const href=`/communities/${slug}`;
  async function join(){
    if(busy||joining.current)return;joining.current=true;setBusy(true);setMessage("");
    try {
      const draftKey=`community-join:${communityId}`;let note:string|null=null;
      if(status!=="invited"&&joinPolicy==="approval"){
        const answer=await ask({draftKey,title:"Ask to join this event’s Community",description:"Your message is private to you and the people reviewing your request. You can leave it blank.",confirmLabel:"Send request",fields:[{name:"message",label:"Message to the Host (optional)",type:"textarea",maxLength:500,placeholder:"Tell the Host why you’d like to join, or mention someone you know."}]});
        if(!answer)return;note=String(answer.message??"").trim()||null;
      }
      const result=await client.rpc("join_community_with_message",{p_community_id:communityId,p_message:note});
      if(result.error)throw result.error;
      clearDraft(draftKey);
      if(result.data==="waitlisted"){setStatus("waitlisted");setMessage("This Community is full. You are on the waiting list; no place is reserved. The Host has been notified.");router.refresh();return;}
      const {data:{user}}=await client.auth.getUser();
      if(!user)throw new Error("Please sign in again.");
      const saved=await client.from("community_memberships").select("status").eq("community_id",communityId).eq("user_id",user.id).maybeSingle();
      if(saved.error)throw saved.error;
      if(!saved.data)throw new Error("We could not confirm your Community membership. Refresh before trying again.");
      setStatus(saved.data.status);setMessage(saved.data.status==="active"?"You have joined. Open the Community to meet everyone.":saved.data.status==="requested"?"Your request is with the Host. We will let you know when it is approved.":"Your membership is saved. Open the Community to see the next step.");router.refresh();
    } catch(cause){setMessage(memberErrorMessage(cause,"join this Community"));}finally{joining.current=false;setBusy(false);}
  }
  return <div className="event-community-join">
    {dialog}
    {status==="active" ? <Link className="button button-primary" href={href}>Open Community</Link>
      : !activeMember ? <><Link className="button button-primary" href={signedIn?`/membership?next=${encodeURIComponent(href)}`:`/sign-in?next=${encodeURIComponent(href)}`}>{signedIn?"Finish joining Her Africa Table":"Sign in or register to join"}</Link><p>Only active Her Africa Table members can join this Community.</p></>
      : status==="requested" ? <><strong>Your request is waiting for the Host</strong><Link className="button button-outline" href={href}>View your request</Link></>
      : status==="waitlisted" ? <><strong>You’re on the waiting list</strong><Link className="button button-outline" href={`/communities#community-${slug}`}>View waiting-list status</Link></>
      : status==="approved_pending_payment" ? <Link className="button button-outline" href={href}>Complete Community membership</Link>
      : joinPolicy==="invite_only" && status!=="invited" ? <p>Ask the Host for an invitation to this Community.</p>
      : <button className="button button-primary" disabled={busy} onClick={()=>void join()} type="button">{busy?"Joining…":joinPolicy==="approval"?"Ask to join this event’s Community":"Join this event’s Community"}</button>}
    {message?<p role="status">{message}</p>:null}
  </div>;
}
