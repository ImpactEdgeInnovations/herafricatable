"use client";

import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {memberErrorMessage} from "@/lib/member-error";
import {useActionDialog} from "@/components/ui/action-dialog";

export type PublicEventHost = {display_name:string; introduction:string; website_url:string|null; linkedin_url:string|null; instagram_url:string|null; contact_email:string|null; contact_phone:string|null};
const blank={display_name:"",introduction:"",website_url:"",linkedin_url:"",instagram_url:"",contact_email:"",contact_phone:"",enabled:false};
export function EventHostPublicDetails({eventId}:{eventId:string}) {
  const supabase=useMemo(()=>createClient(),[]);
  const router=useRouter();
  const {ask,dialog}=useActionDialog();
  const [values,setValues]=useState(blank);
  const [saved,setSaved]=useState(blank);
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let live=true;
    void supabase.from("event_host_public_details").select("display_name,introduction,website_url,linkedin_url,instagram_url,contact_email,contact_phone,enabled").eq("event_id",eventId).maybeSingle().then(({data,error})=>{
      if(!live)return;
      if(error){setMessage("Host details could not load. Please reopen this tab shortly.");return;}
      const next={...blank,...Object.fromEntries(Object.entries(data??{}).map(([key,value])=>[key,value??""]))} as typeof blank;
      setValues(next);setSaved(next);setReady(true);
    });
    return()=>{live=false;};
  },[eventId,supabase]);
  const changed=JSON.stringify(values)!==JSON.stringify(saved);
  const update=(key:keyof typeof blank,value:string|boolean)=>{setValues(current=>({...current,[key]:value}));setMessage("");};
  async function save(){
    const snapshot={...values};
    if(snapshot.enabled && snapshot.display_name.trim().length<2){setMessage("Add the name guests should see.");return;}
    setBusy(true);setMessage("");
    try{
      if(snapshot.enabled && !await ask({title:"Share these Host details?",description:"Your chosen name, introduction, links and contact details will appear on this event page. For a public event, anyone can see them. Your private account details are not copied.",confirmLabel:"Share and save"}))return;
      const {error}=await supabase.rpc("save_event_host_public_details",{p_event_id:eventId,p_details:snapshot});
      if(error)throw error;
      setSaved(snapshot);setMessage(snapshot.enabled?"Your Host details are now saved for this event page.":"Your Host details are hidden from the event page.");router.refresh();
    }catch(error){setMessage(memberErrorMessage(error,"save your Host details"));}
    finally{setBusy(false);}
  }
  return <div className="event-host-public-editor">
    <h2>Meet the Host</h2><p>Choose what guests can see. Nothing is taken from your private contact details.</p>
    <fieldset disabled={!ready||busy}>
      <label>Name guests will see<input value={values.display_name} maxLength={120} onChange={e=>update("display_name",e.target.value)} placeholder="Your name or organising team"/></label>
      <label>A little about you <small>Optional</small><textarea rows={3} maxLength={500} value={values.introduction} onChange={e=>update("introduction",e.target.value)} placeholder="Who you are and why you are hosting this event"/></label>
      <details><summary>Add links or a contact <small>Optional</small></summary>
        <p>Use only details you are comfortable sharing with visitors.</p>
        {([['website_url','Website','https://…'],['linkedin_url','LinkedIn','https://www.linkedin.com/in/…'],['instagram_url','Instagram','https://www.instagram.com/…'],['contact_email','Public contact email','hello@example.com'],['contact_phone','Public contact number','+254…']] as const).map(([key,label,placeholder])=><label key={key}>{label}<input type={key==='contact_email'?'email':key==='contact_phone'?'tel':'url'} value={values[key]} onChange={e=>update(key,e.target.value)} maxLength={key==='contact_phone'?40:key==='contact_email'?254:500} placeholder={placeholder}/></label>)}
      </details>
      <label className="event-host-public-consent"><input type="checkbox" checked={values.enabled} onChange={e=>update("enabled",e.target.checked)}/><span>Show these details on this event page</span></label>
      <div className="portal-actions"><button type="button" className="button button-primary" disabled={!changed} onClick={()=>void save()}>{busy?"Saving…":"Save Host details"}</button>{changed?<button className="button button-outline" type="button" onClick={()=>{setValues(saved);setMessage("");}}>Discard changes</button>:null}</div>
    </fieldset>
    {message?<p role="status">{message}</p>:null}{dialog}
  </div>;
}
