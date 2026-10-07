"use client";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {memberErrorMessage} from "@/lib/member-error";
import {useActionDialog} from "@/components/ui/action-dialog";
export type CommunityConnection = {connection_id:string;other_user_id:string;status:string;direction:string};
export function CommunityConnectionActions({memberId,self,connection,ready}:{memberId:string;self:boolean;connection:CommunityConnection|null;ready:boolean}) {
  const client=useMemo(()=>createClient(),[]);const router=useRouter();const {ask,dialog}=useActionDialog();
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");
  async function act(action:"request"|"accept"|"ignore"|"message"){
    if(busy)return;setBusy(true);setNotice("");
    try {
      if(action==="request"){
        const [profile,mode]=await Promise.all([client.rpc("get_member_profile",{p_member_id:memberId}),client.rpc("get_member_connection_mode",{p_member_id:memberId})]);
        if(profile.error)throw profile.error;
        if(mode.error)throw mode.error;
        const person=profile.data?.[0];
        if(!person || mode.data!=="open") {setNotice("She is not accepting new connection requests right now.");return;}
        const choice=await ask({title:"Ask to connect",description:"She can accept or decline privately. Messaging opens only after you both agree.",confirmLabel:"Send request",fields:[{name:"note",label:"A short note (optional)",type:"textarea",minLength:10,maxLength:500}]});
        if(!choice)return;
        const result=await client.rpc("request_connection_with_context",{p_member_id:memberId,p_connection_code:null,p_introduction_note:String(choice.note??"")});
        if(result.error)throw result.error;setNotice("Request sent. We will let you know when she accepts.");router.refresh();
      } else if(action==="message"){
        if(!connection || connection.status!=="accepted")return;
        const result=await client.rpc("ensure_conversation",{p_connection_id:connection.connection_id});
        if(result.error)throw result.error;
        if(!result.data)throw new Error("We could not open this conversation.");
        router.push(`/messages?conversation=${encodeURIComponent(result.data)}`);
      } else {
        if(!connection || connection.direction!=="incoming")return;
        const result=await client.rpc("respond_to_connection",{p_connection_id:connection.connection_id,p_action:action});
        if(result.error)throw result.error;setNotice(action==="accept"?"You are connected. You can now message each other.":"Request declined privately.");router.refresh();
      }
    }catch(cause){setNotice(memberErrorMessage(cause,"update this connection"));}finally{setBusy(false);}
  }
  if(self)return <small>Your profile</small>;
  if(!ready)return <small>Connection options are unavailable just now. Open her profile to try again.</small>;
  return <div className="community-connection-actions">
    {connection?.status==="accepted"?<button type="button" disabled={busy} onClick={()=>void act("message")}>Message</button>
      : connection?.status==="pending" && connection.direction==="incoming"?<><span>Wants to connect</span><button type="button" disabled={busy} onClick={()=>void act("accept")}>Accept</button><button type="button" disabled={busy} onClick={()=>void act("ignore")}>Not now</button></>
      : connection?.status==="pending"?<span>Request sent · waiting for her</span>
      : <button type="button" disabled={busy} onClick={()=>void act("request")}>Ask to connect</button>}
    {notice?<p role="status">{notice}</p>:null}{dialog}
  </div>;
}
