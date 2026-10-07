"use client";
import Link from "next/link";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {memberErrorMessage} from "@/lib/member-error";

export function EventCommunityJoin({communityId,slug,activeMember,signedIn,initialStatus,joinPolicy}: {
  communityId:string;slug:string;activeMember:boolean;signedIn:boolean;initialStatus:string|null;joinPolicy:string|null;
}) {
  const client=useMemo(()=>createClient(),[]);const router=useRouter();
  const [status,setStatus]=useState(initialStatus);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const href=`/communities/${slug}`;
  async function join(){
    if(busy)return;setBusy(true);setMessage("");
    try {
      const result=status==="invited"
        ? await client.rpc("respond_to_community_invitation",{p_community_id:communityId,p_accept:true})
        : await client.rpc("request_community_access",{p_community_id:communityId});
      if(result.error)throw result.error;
      const {data:{user}}=await client.auth.getUser();
      if(!user)throw new Error("Please sign in again.");
      const saved=await client.from("community_memberships").select("status").eq("community_id",communityId).eq("user_id",user.id).maybeSingle();
      if(saved.error)throw saved.error;
      if(!saved.data)throw new Error("We could not confirm your Community membership. Refresh before trying again.");
      setStatus(saved.data.status);setMessage(saved.data.status==="active"?"You have joined. Open the Community to meet everyone.":saved.data.status==="requested"?"Your request is with the Host. We will let you know when it is approved.":"Your membership is saved. Open the Community to see the next step.");router.refresh();
    } catch(cause){setMessage(memberErrorMessage(cause,"join this Community"));}finally{setBusy(false);}
  }
  return <div className="event-community-join">
    {status==="active" ? <Link className="button button-primary" href={href}>Open Community</Link>
      : !activeMember ? <><Link className="button button-primary" href={signedIn?`/membership?next=${encodeURIComponent(href)}`:`/sign-in?next=${encodeURIComponent(href)}`}>{signedIn?"Finish joining Her Africa Table":"Sign in or register to join"}</Link><p>Only active Her Africa Table members can join this Community.</p></>
      : status==="requested" ? <><strong>Your request is waiting for the Host</strong><Link className="button button-outline" href={href}>View your request</Link></>
      : status==="approved_pending_payment" ? <Link className="button button-outline" href={href}>Complete Community membership</Link>
      : joinPolicy==="invite_only" && status!=="invited" ? <p>Ask the Host for an invitation to this Community.</p>
      : <button className="button button-primary" disabled={busy} onClick={()=>void join()} type="button">{busy?"Joining…":joinPolicy==="approval"?"Ask to join this event’s Community":"Join this event’s Community"}</button>}
    {message?<p role="status">{message}</p>:null}
  </div>;
}
