"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { adminErrorMessage } from "@/lib/admin-error";
type Check = { key: string; passed: boolean; evidence: string; checked_at: string | null };
type Community = { id: string; name: string; status: string; allowance_bytes: number; used_bytes: number; uploads_enabled: boolean; waiting_cleanup: number };
type Cursor = { name: string; id: string };
type Operations = { checks: Check[]; health: { finished_at: string; removed: number; failed: number } | null; communities: Community[]; has_more: boolean; next_cursor: Cursor | null };
const labels: Record<string,string> = { binary_delivery: "Photos upload and open correctly", access_control: "Only authorised people can view photos", cleanup_recovery: "Failed uploads, removal and cleanup work", mobile_review: "Member, Host and Admin screens work on mobile" };
export function CommunityPhotoOperations() {
 const supabase = useMemo(() => createClient(), []);
 const { ask, dialog } = useActionDialog();
 const [data,setData] = useState<Operations | null>(null);
 const [busy,setBusy] = useState(false);
 const [message,setMessage] = useState("");
 const [retry,setRetry] = useState(0);
 const [search,setSearch] = useState("");
 const [appliedSearch,setAppliedSearch] = useState("");
 const [positions,setPositions] = useState<(Cursor | null)[]>([null]);
 const changingPage=useRef(false);
 const cursor=positions[positions.length-1];
 useEffect(() => { let active=true; setBusy(true); setData(null);
  async function load() {
   try {
    const {data,error}=await supabase.rpc("get_admin_community_photo_operations_page",{
     p_search:appliedSearch,p_after_name:cursor?.name??null,p_after_id:cursor?.id??null,
    });
    if(error)throw error;
    if(active)setData(data as Operations);
   }catch(error){if(active)setMessage(adminErrorMessage(error,"open photo controls"));}
   finally{if(active){changingPage.current=false;setBusy(false);}}
  }
  void load(); return () => { active=false; };
 },[retry,supabase,appliedSearch,cursor]);
 function find(value: string) {
  if(changingPage.current)return;
  changingPage.current=true;setBusy(true);setData(null);
  setAppliedSearch(value.trim());setPositions([null]);setMessage("");setRetry(value=>value+1);
 }
 function page(next: (Cursor | null)[]) {
  if(changingPage.current)return;
  changingPage.current=true;setBusy(true);setData(null);setMessage("");setPositions(next);
 }
 async function check(item: Check) {
  const result = await ask({ title: item.passed ? "Reopen this check?" : "Record a completed test", description: item.passed ? "Uploads will be paused in every Community until this check passes again." : "Only record a pass after testing the real feature. Code checks alone are not enough.", confirmLabel: item.passed ? "Reopen check and pause uploads" : "Record test result", fields: [{ name:"evidence",label:"What was tested, and when?",type:"textarea",required:true,minLength:10,maxLength:1000 }] });
  if (!result) return;
  await save("save_community_photo_release_check",{p_key:item.key,p_passed:!item.passed,p_evidence:String(result.evidence)});
 }
 async function settings(item: Community) {
  const result = await ask({ title:`Photo settings · ${item.name}`,description:"Eligible pilot Communities can share photos during the pilot. Other Communities need all four tests and a successful cleanup run. Pausing keeps existing photos visible and prevents the Host reopening uploads.",confirmLabel:"Save settings",fields:[
   {name:"allowance",label:"Storage allowance (MB)",type:"number",integer:true,min:2,max:10240,initialValue:String(Math.round(item.allowance_bytes/1048576)),required:true},
   {name:"enabled",label:"Allow photo uploads",type:"checkbox",initialValue:item.uploads_enabled},
   {name:"reason",label:"Reason for this change",type:"textarea",required:true,minLength:5,maxLength:1000},
  ] }); if (!result) return;
  await save("save_admin_community_photo_settings",{p_community_id:item.id,p_allowance_mb:Number(result.allowance),p_enabled:Boolean(result.enabled),p_reason:String(result.reason)});
 }
 async function save(name: string,args: Record<string,unknown>) {
  setBusy(true);setMessage("");
  try { const {error}=await supabase.rpc(name,args);if(error)throw error;setMessage("Saved.");setRetry(value=>value+1); }
  catch(error){setMessage(adminErrorMessage(error,"save photo settings"));}
  finally{setBusy(false);}
 }
 async function cleanup() {
  if (!await ask({title:"Run photo cleanup?",description:"Clear expired uploads and photos whose recovery period has ended. Open safety reviews retain their files within the review period. This does not approve uploads.",confirmLabel:"Run cleanup"}))return;
  setBusy(true);setMessage("");
  try {
   const response=await fetch("/api/admin/community/photos/cleanup",{method:"POST",credentials:"same-origin"});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"Some files could not be cleared. Uploads stay paused until the failure is resolved.");
   setMessage(`Cleanup finished: ${result.removed} cleared.`);
   setRetry(value=>value+1);
  }catch(error){setMessage(adminErrorMessage(error,"run photo cleanup"));setRetry(value=>value+1);}
  finally{setBusy(false);}
 }
 return <section className="admin-section" id="community-photo-controls">{dialog}
  <div className="admin-section-heading"><div><h2>Community photos</h2><p>Upload permissions, storage limits and cleanup health.</p></div><div><button disabled={busy} onClick={()=>setRetry(value=>value+1)}>Refresh</button> <button disabled={busy} onClick={()=>void cleanup()}>Run cleanup</button></div></div>
  {message?<p role="status">{message}</p>:null}
  {!data ? <p>{busy?"Opening photo controls…":"Photo controls could not be opened. Try Refresh."}</p>:<>
   <p>{data.health?`Last cleanup: ${new Intl.DateTimeFormat("en-KE",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Nairobi"}).format(new Date(data.health.finished_at))} · ${data.health.removed} cleared · ${data.health.failed} failed` : "Cleanup has not reported a run yet. Pilot sharing is available; wider release still needs a successful run."}</p>
   {data.health && Date.now()-new Date(data.health.finished_at).getTime()>48*60*60*1000 ? <p>Cleanup is overdue. Run cleanup before opening photo uploads in another Community.</p>:null}
   <details><summary>Photo launch checks · {data.checks.filter(c=>c.passed).length} of 4 checked</summary>
    {data.checks.map(c=><article key={c.key}><strong>{labels[c.key]}</strong><p>{c.passed?"Checked":"Not checked yet"}{c.evidence?` · ${c.evidence}`:""}</p><button disabled={busy} onClick={()=>void check(c)}>{c.passed?"Reopen check":"Record completed test"}</button></article>)}
   </details>
   <form className="community-photo-admin-search" onSubmit={event=>{event.preventDefault();if(!busy)find(search);}}>
    <label>Find a Community<input type="search" placeholder="Community name" maxLength={120} value={search} onChange={event=>setSearch(event.target.value)} /></label>
    <button type="submit" disabled={busy}>Search</button>
    {appliedSearch?<button type="button" disabled={busy} onClick={()=>{setSearch("");find("");}}>Clear search</button>:null}
   </form>
   {data.communities.length?<div>{data.communities.map(c=><article key={c.id} className="community-photo-admin-row"><div><strong>{c.name}</strong><p>{c.status!=="published"?"Community not open":c.uploads_enabled?"Uploads allowed":"Uploads paused"} · {Math.ceil(c.used_bytes/1048576)} of {Math.round(c.allowance_bytes/1048576)} MB used · {c.waiting_cleanup} awaiting cleanup/review</p></div><button disabled={busy} onClick={()=>void settings(c)}>Photo settings</button></article>)}</div>:<p>{appliedSearch?"No matching Communities.":positions.length>1?"No Communities on this page. Go back to the previous page.":"No Communities yet."}</p>}
   <nav className="community-photo-admin-pages" aria-label="Community photo pages">
    <button type="button" disabled={busy||positions.length===1} onClick={()=>page(positions.slice(0,-1))}>Previous</button>
    <span role="status"> Page {positions.length} · {data.communities.length} Communities </span>
    <button type="button" disabled={busy||!data.has_more||!data.next_cursor} onClick={()=>{if(data.next_cursor)page([...positions,data.next_cursor]);}}>Next</button>
   </nav>
  </>}
 </section>;
}
