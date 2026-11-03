"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {eventThankYouEmail,type EventThankYou} from "@/lib/notifications/event-thank-you";
import styles from "./event-thank-you-settings.module.css";

export type ThankYouSettings = {enabled:boolean;message:string;due_at:string;timezone:string;applies:boolean;message_locked:boolean;
  queued:number;sent:number;failed:number;suppressed:number;preview:EventThankYou};

export function EventThankYouSettings({eventId}:{eventId:string}) {
  const client=useMemo(()=>createClient(),[]),alive=useRef(true),loaded=useRef(false),lock=useRef(false),generation=useRef(0),reading=useRef(false);
  const [settings,setSettings]=useState<ThankYouSettings|null>(null),[ready,setReady]=useState(false),[enabled,setEnabled]=useState(true),[message,setMessage]=useState("");
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[feedback,setFeedback]=useState(""),[preview,setPreview]=useState(false);
  const load=useCallback(async()=>{
    if(lock.current||reading.current)return;
    reading.current=true;setLoading(true);const request=++generation.current;
    try {
      const result=await client.rpc("get_event_thank_you_settings",{p_event_id:eventId});
      if(!alive.current||request!==generation.current)return;
      if(result.error||!result.data)throw Error("Unavailable");
      const value=result.data as ThankYouSettings;setSettings(value);setReady(true);setError("");
      if(!loaded.current){loaded.current=true;setEnabled(value.enabled);setMessage(value.message);}
    }catch {if(alive.current&&request===generation.current){setReady(false);setError("Your thank-you email settings could not load. Please try again.");}}
    finally {if(request===generation.current){reading.current=false;if(alive.current)setLoading(false);}}
  },[client,eventId]);
  useEffect(()=>{alive.current=true;loaded.current=false;setSettings(null);setReady(false);void load();return()=>{alive.current=false;generation.current++;reading.current=false;};},[load]);
  async function save() {
    if(lock.current||reading.current||!ready||!settings?.applies)return;
    lock.current=true;setBusy(true);setError("");setFeedback("");
    try {
      const result=await client.rpc("save_event_thank_you_settings",{p_event_id:eventId,p_enabled:enabled,p_message:settings.message_locked?settings.message:message.trim()});
      if(result.error||!result.data)throw Error("Unavailable");
      if(!alive.current)return;
      const value=result.data as ThankYouSettings;setSettings(value);setEnabled(value.enabled);setMessage(value.message);setReady(true);
      setFeedback(value.enabled?"Saved. Your thank-you email is on for guests who checked in.":"Saved. Automatic thank-you emails are off. Emails already in progress or sent cannot be recalled.");
    }catch {if(alive.current){setError("Your change could not be confirmed. Refresh status before trying again. Your message is still here.");setReady(false);}}
    finally {lock.current=false;if(alive.current)setBusy(false);}
  }
  const dirty=settings&&(enabled!==settings.enabled||(!settings.message_locked&&message.trim()!==settings.message));
  const previewHtml=ready&&settings?eventThankYouEmail({...settings.preview,host_message:settings.message_locked?settings.message:message},"https://www.herafricatable.com").html.replace(/href="[^"]*"/g,'aria-disabled="true" tabindex="-1"'):"";
  return <section className={styles.panel} id="host-thank-you" aria-labelledby="thank-you-settings-title"><header><div><p className={styles.eyebrow}>After the event</p><h2 id="thank-you-settings-title">A thank-you from your table.</h2><p>One thoughtful email for guests whose arrival was recorded.</p></div><button className="button button-outline" type="button" disabled={busy||loading} onClick={()=>void load()}>{loading?"Refreshing…":"Refresh status"}</button></header>
    {error?<p className={styles.error} role="alert">{error}</p>:null}
    {!settings&&!error?<p role="status">Loading your email settings…</p>:null}
    {ready&&settings?<>
      {!settings.applies?<p className={styles.note}>Automatic thank-you emails apply to in-person and hybrid events ending after this feature was introduced. Earlier events are not emailed retrospectively.</p>:null}
      <label className={styles.toggle}><input type="checkbox" checked={enabled} disabled={busy||!settings.applies} onChange={e=>{setEnabled(e.target.checked);setFeedback("");}}/><span><strong>Send a thank-you email after this event</strong><small>For checked-in guests who allow event emails. One thank-you per guest.</small></span></label>
      <p className={styles.schedule}>From {new Intl.DateTimeFormat("en-KE",{dateStyle:"medium",timeStyle:"short",timeZone:settings.timezone}).format(new Date(settings.due_at))} · {settings.timezone.replaceAll("_"," ")}<small>Sending begins after this time. Delivery may take longer during busy periods.</small></p>
      <label className={styles.message}>Your message (optional)<textarea maxLength={600} rows={3} value={settings.message_locked?settings.message:message} disabled={busy||!settings.applies||settings.message_locked} onChange={e=>{setMessage(e.target.value);setFeedback("");}} placeholder="Thank you for sharing your evening with us. I hope we’ll see you at the next table."/><small>{settings.message_locked?"Sending has started, so this message can no longer be edited. You can still switch off emails that have not started sending.":"Keep it short and personal. Your saved message appears above the Host’s name."}</small></label>
      <div className={styles.actions}><button className="button button-primary" type="button" disabled={busy||loading||!settings.applies||!dirty} onClick={()=>void save()}>{busy?"Saving…":"Save changes"}</button><button className="button button-outline" type="button" aria-expanded={preview} aria-controls="thank-you-preview" onClick={()=>setPreview(v=>!v)}>{preview?"Close preview":"Preview email"}</button><span>{dirty?"Changes not saved yet":"Settings saved"}</span></div>
      {settings.queued+settings.sent+settings.failed+settings.suppressed>0?<p className={styles.delivery}>{settings.queued} waiting or in progress · {settings.sent} accepted by email provider · {settings.failed} need attention · {settings.suppressed} stopped<small>Provider acceptance does not guarantee inbox delivery.</small></p>:null}
      {preview?<div className={styles.preview} id="thank-you-preview"><p>Example for Amina{dirty?" · Includes your unsaved message":""}. No email is sent, and preview links are disabled.</p><iframe className={styles.frame} title="Example thank-you email" sandbox="" srcDoc={previewHtml}/></div>:null}
    </>:null}
    {feedback?<p className={styles.feedback} role="status">{feedback}</p>:null}
  </section>;
}
