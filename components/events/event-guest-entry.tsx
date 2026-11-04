"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {createClient} from "@/lib/supabase/client";
import styles from "./event-guest-entry.module.css";

class GuestDetailsUnavailable extends Error {}

export function EventGuestEntry({eventId,eventTitle,signedIn=false,initialName="",initialEmail="",ready=true}:{eventId:string;eventTitle:string;signedIn?:boolean;initialName?:string;initialEmail?:string;ready?:boolean}) {
  const client=useMemo(()=>createClient(),[]),router=useRouter(),lock=useRef(false),alive=useRef(true);
  const [stage,setStage]=useState<"details"|"email"|"code">(signedIn?"details":"email");
  const [name,setName]=useState(initialName),[email,setEmail]=useState(initialEmail),[code,setCode]=useState(""),[agreed,setAgreed]=useState(false);
  const [busy,setBusy]=useState(false),[cooldown,setCooldown]=useState(0),[error,setError]=useState(""),[notice,setNotice]=useState("");
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(cooldown<=0)return;const id=setTimeout(()=>setCooldown(v=>Math.max(0,v-1)),1000);return()=>clearTimeout(id);},[cooldown]);
  async function action(task:()=>Promise<void>) {
    if(lock.current||!ready)return;lock.current=true;setBusy(true);setError("");setNotice("");
    try{await task();}catch(error){if(alive.current)setError(error instanceof GuestDetailsUnavailable?"Your email is confirmed, but your booking details could not be saved. Try Continue to booking again. Guest booking may have been paused.":stage==="code"?"That code could not be confirmed. Use the latest email and try again.":"We could not continue your booking. Please try again. Guest booking may have been paused.");}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function saveDetails(){
    const result=await client.rpc("save_my_event_guest_details",{p_event_id:eventId,p_display_name:name.trim(),p_agreed:agreed});
    if(result.error)throw new GuestDetailsUnavailable();
    if(alive.current){setNotice("Email confirmed. Loading your booking options…");router.refresh();}
  }
  async function sendCode(){
    const result=await client.auth.signInWithOtp({email:email.trim().toLowerCase(),options:{shouldCreateUser:true}});
    if(result.error)throw Error("Code unavailable");
    if(alive.current){setStage("code");setCooldown(60);setNotice("Check your email for a one-time code. Please check Spam too.");}
  }
  function submit(event:FormEvent){event.preventDefault();if(name.trim().length<2||!agreed)return;
    void action(async()=>{
      if(stage==="email")return sendCode();
      if(stage==="code"){
        if(!/^\d{6,10}$/.test(code))throw Error("Invalid code");
        const result=await client.auth.verifyOtp({email:email.trim().toLowerCase(),token:code,type:"email"});
        if(result.error||!result.data?.session)throw Error("Invalid code");
        if(!alive.current)return;setStage("details");setCode("");
      }
      await saveDetails();
    });
  }
  return <div className={styles.panel} aria-labelledby="guest-booking-title">
    <p className={styles.kicker}>Your event booking</p><h2 id="guest-booking-title">{stage==="code"?"Check your email":"Book your place"}</h2>
    <p className={styles.intro}>{eventTitle}<span>Joining the HAT member network is optional. No membership application is needed to book this event.</span></p>
    {!ready?<div role="alert"><p>We could not check your booking details.</p><button className="button button-outline" type="button" onClick={()=>router.refresh()}>Try again</button></div>:<form onSubmit={submit}>
      {stage!=="code"?<><div className={styles.fields}><label>Your name<input autoComplete="name" minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)} required disabled={busy}/></label><label>Email address<input type="email" autoComplete="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy||stage==="details"}/></label></div>
        <label className={styles.terms}><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} required disabled={busy}/><span>I accept the <Link href="/terms" target="_blank" rel="noopener">booking terms</Link> and have read the <Link href="/privacy" target="_blank" rel="noopener">privacy notice</Link>.</span></label><p className={styles.help}>We use your email to manage this booking and send event updates. This does not sign you up for marketing or approve HAT membership.</p></>:<><p className={styles.sent}>Code sent to <strong>{email}</strong></p><label className={styles.code}>One-time code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" minLength={6} maxLength={10} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,10))} required disabled={busy}/></label></>}
      <div className={styles.actions}><button className="button button-primary" disabled={busy||!agreed||name.trim().length<2}>{busy?"Please wait…":stage==="email"?"Email me a code":stage==="code"?"Confirm and continue":"Continue to booking"}</button>
        {stage==="code"?<><button className={styles.quiet} type="button" disabled={busy||cooldown>0} onClick={()=>void action(sendCode)}>{cooldown>0?`Resend in ${cooldown}s`:"Resend code"}</button><button className={styles.quiet} type="button" disabled={busy} onClick={()=>{setStage("email");setCode("");setError("");setNotice("");}}>Change email</button></>:null}</div>
      {stage==="code"?<p className={styles.help}>No password to remember. Your place is not reserved until you complete the next booking step.</p>:null}
    </form>}
    {error?<p className={styles.error} role="alert">{error}</p>:null}{notice?<p className={styles.notice} role="status">{notice}</p>:null}
  </div>;
}
