"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {memberErrorMessage} from "@/lib/member-error";

export function CommunityHostActivity({communityId,kind,onClose}:{communityId:string;kind:"posts"|"replies"|"asks"|"events"|"reports";onClose:()=>void}){
  const client=useMemo(()=>createClient(),[]);
  const [items,setItems]=useState<{item_id:string;title:string;body:string;created_at:string;href:string}[]>([]);
  const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [retry,setRetry]=useState(0);
  const titles={posts:"New posts this week",replies:"Replies this week",asks:"Questions without replies",events:"Upcoming Community events",reports:"Safety reports"};
  useEffect(()=>{let current=true;setLoading(true);setError("");setItems([]);
    if(kind==="reports"){setLoading(false);return;}
    void (async()=>{try{const result=await client.rpc("list_community_host_activity",{p_community_id:communityId,p_kind:kind});if(!current)return;if(result.error||!Array.isArray(result.data))throw result.error||Error("This activity could not be loaded.");setItems(result.data);}catch(failure){if(current)setError(memberErrorMessage(failure,"load this Community activity"));}finally{if(current)setLoading(false);}})();return()=>{current=false;};
  },[client,communityId,kind,retry]);
  return <section id="host-activity" className="community-host-panel community-host-activity" aria-labelledby="host-activity-title"><header><h2 id="host-activity-title" tabIndex={-1}>{titles[kind]}</h2><button type="button" onClick={onClose}>Close</button></header>
    {kind==="reports"?<><p>Report details are private with the Her Africa Table safety team. A report is not a finding against someone. Hosts can manage member access, but cannot see confidential reporter details here.</p><Link href="/support">Contact the safety team</Link></>:loading?<p role="status">Loading…</p>:error?<div role="status"><p>{error}</p><button type="button" onClick={()=>setRetry(v=>v+1)}>Try again</button></div>:!items.length?<p>No {kind==="asks"?"unanswered questions":kind} to show.</p>:<div className="community-host-activity-list">{items.map(item=><article key={item.item_id}><strong>{item.title}</strong><p>{item.body}</p><Link href={item.href}>{kind==="events"?"Open meetup":"Open conversation to reply"}</Link></article>)}</div>}
    {items.length===50?<p>Showing the latest 50 items.</p>:null}
  </section>;
}
