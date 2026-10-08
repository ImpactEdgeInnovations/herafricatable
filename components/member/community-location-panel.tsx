"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CommunityLocation = { community_id: string; location_scope: "global" | "place" | null; location_label: string | null };

export function CommunityLocationPanel({communityId,location}: {communityId:string;location:CommunityLocation|null}) {
  const supabase=useMemo(()=>createClient(),[]);
  const router=useRouter();
  const [scope,setScope]=useState(location?.location_scope??"");
  const [place,setPlace]=useState(location?.location_label??"");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy)return;
    setBusy(true);setMessage("");
    try {
      const {error}=await supabase.rpc("save_community_location",{p_community_id:communityId,p_location_scope:scope,p_location_label:place});
      if(error)throw error;
      setMessage("Location saved. Members can now find your Community using this location.");router.refresh();
    } catch(error) {setMessage(memberErrorMessage(error,"save your Community location"));}
    finally {setBusy(false);}
  }
  return <form onSubmit={save} className="community-host-form">
    <p>Help members find your Community. This does not limit who can join.</p>
    <fieldset disabled={busy} className="community-host-form-grid">
      <label>Where is your Community based?
        <select required value={scope} onChange={event=>setScope(event.target.value)}>
          <option value="" disabled>Choose one</option><option value="global">Global / online</option><option value="place">A specific place</option>
        </select>
      </label>
      {scope==="place"?<label>City or area<input required minLength={2} maxLength={100} value={place} onChange={event=>setPlace(event.target.value)} placeholder="e.g. Lavington, Nairobi"/></label>:null}
    </fieldset>
    <button type="submit" className="button button-primary" disabled={busy}>{busy?"Saving…":"Save location"}</button>
    {message?<p role="status">{message}</p>:null}
  </form>;
}
