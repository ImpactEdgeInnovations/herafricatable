"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {retryCommunityAttachment} from "@/lib/community-attachment-delivery";
import type {CommunityPostAttachment} from "./community-feed";

export function CommunityAttachmentRetry({communityId,postId}:{communityId:string;postId:string}) {
  const client=useMemo(()=>createClient(),[]);
  const [attachment,setAttachment]=useState<CommunityPostAttachment|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("This attachment could not load. You can still read and reply to the conversation.");
  const active=useRef(true);
  const pending=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function retry(){
    if(pending.current)return;
    pending.current=true;setBusy(true);setAttachment(null);
    try {
      const next=await retryCommunityAttachment<CommunityPostAttachment>(client,communityId,postId);
      if(!active.current)return;
      setAttachment(next);
      setMessage(!next?"This attachment is no longer available.":!next.signed_url&&next.storage_path?"The attachment still could not load. Please try again shortly.":"");
    }catch {
      if(active.current)setMessage("We could not load this attachment. Please try again shortly.");
    }finally{pending.current=false;if(active.current)setBusy(false);}
  }
  if(attachment?.signed_url&&attachment.attachment_type==="image")return <figure className="community-post-image"><img src={attachment.signed_url} alt={attachment.alt_text??""} loading="lazy" onError={()=>{setAttachment(null);setMessage("This image could not load. Please try again.");}}/>{attachment.original_name?<figcaption>{attachment.original_name}</figcaption>:null}</figure>;
  if(attachment?.signed_url&&attachment.attachment_type==="document")return <a className="community-post-document" href={attachment.signed_url} target="_blank" rel="noreferrer"><span aria-hidden="true">PDF</span><strong>{attachment.original_name??"Community document"}</strong><em>Open</em></a>;
  if(attachment?.attachment_type==="link"&&attachment.external_url)return <a className="community-post-link" href={attachment.external_url} target="_blank" rel="noreferrer">Open shared link ↗</a>;
  return <div className="community-attachment-unavailable"><p role="status">{busy?"Loading attachment…":message}</p><button type="button" disabled={busy} onClick={()=>void retry()}>{busy?"Loading…":"Try loading attachment"}</button></div>;
}
