"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";

export function CommunityMembershipControl({communityId,name,role}:{communityId:string;name:string;role:string|null}) {
  const client=useMemo(()=>createClient(),[]);
  const router=useRouter();
  const {ask,dialog}=useActionDialog();
  const lock=useRef(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function leave() {
    if(lock.current)return;
    lock.current=true;
    try {
      if(!await ask({title:`Leave ${name}?`,description:"You will lose access to this community. Your posts and replies stay here. Your Her Africa Table membership stays active. Leaving does not automatically refund a payment; you can ask to join again later under the community’s joining rules.",confirmLabel:"Leave community",tone:"danger"}))return;
      setBusy(true);setMessage("");
      const result=await client.rpc("manage_my_community_membership",{p_community_id:communityId,p_action:"leave"});
      if(result.error)throw result.error;
      router.replace("/communities");router.refresh();
    }catch(error){setMessage(memberErrorMessage(error,"leave this community"));}
    finally{lock.current=false;setBusy(false);}
  }
  if(!["member","owner","moderator"].includes(role ?? ""))return null;
  return <details className="community-membership-control"><summary>Your membership</summary><div>{role === "member" ? <><p>You have joined {name}. Leaving this community does not close your Her Africa Table account.</p><button type="button" disabled={busy} onClick={()=>void leave()}>{busy?"Leaving…":"Leave community"}</button></> : <><p>{role === "owner" ? "You are the Host. Arrange a handover with the platform team before leaving so members are not left without a Host." : "You are a moderator. Ask the Host to change your role to member before leaving."}</p>{role === "owner" ? <Link href="/support">Ask about a Host handover</Link> : null}</>}{message?<p role="alert">{message}</p>:null}</div>{dialog}</details>;
}
