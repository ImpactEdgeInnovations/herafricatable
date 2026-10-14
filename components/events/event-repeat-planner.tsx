"use client";
import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import type { MemberEventProposal, HostedCommunity } from "./member-event-proposal";
import type { ApplicationProposalMedia } from "@/lib/application-proposal-media";
import type { CommunityEventProposal } from "@/components/community/community-event-proposal-panel";
const PublicEditor = dynamic(() => import("./member-event-proposal").then(module => module.MemberEventProposalPanel));
const CommunityEditor = dynamic(() => import("@/components/community/community-event-proposal-panel").then(module => module.CommunityEventProposalPanel));
type Plan = { proposal_ids: string[]; frequency: string; first_starts_at: string };
function localValue(value: Date) { return new Date(value.getTime()-value.getTimezoneOffset()*60_000).toISOString().slice(0,16); }

export function EventRepeatPlanner({ eventId, communityId, communitySlug = "", currentUserId, sourceStartsAt }: {
  eventId: string; communityId?: string; communitySlug?: string; currentUserId: string; sourceStartsAt: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [opened,setOpened] = useState(false);
  const [frequency,setFrequency] = useState("none");
  const [count,setCount] = useState("2");
  const [starts,setStarts] = useState(() => localValue(new Date(Math.max(new Date(sourceStartsAt).getTime()+7*86400000,Date.now()+8*86400000))));
  const [plan,setPlan] = useState<Plan | null>(null);
  const [rows,setRows] = useState<(MemberEventProposal | CommunityEventProposal)[]>([]);
  const [selected,setSelected] = useState("");
  const [pilot,setPilot] = useState(false);
  const [published,setPublished] = useState<string[]>([]);
  const [media,setMedia] = useState<ApplicationProposalMedia[]>([]);
  const [mediaReady,setMediaReady] = useState(false);
  const [communities,setCommunities] = useState<HostedCommunity[]>([]);
  const [busy,setBusy] = useState(false);
  const [ready,setReady] = useState(false);
  const [message,setMessage] = useState("");
  const pending = useRef(false);
  const requestId = useRef("");
  async function load() {
    if (pending.current) return;
    pending.current=true;setBusy(true);setMessage("");
    try {
      let query=supabase.from("event_repeat_plans").select("proposal_ids,frequency,first_starts_at").eq("source_event_id",eventId).eq("created_by",currentUserId);
      query=communityId ? query.eq("community_id",communityId) : query.is("community_id",null);
      const result=await query.maybeSingle();
      if(result.error)throw result.error;
      const saved=result.data as Plan | null;setPlan(saved);
      if(saved) {
        const drafts=communityId ? await supabase.rpc("list_my_community_event_proposals",{p_community_id:communityId}) : await supabase.rpc("list_my_member_event_proposals");
        if(drafts.error)throw drafts.error;
        setRows((drafts.data??[]).filter((row: MemberEventProposal | CommunityEventProposal)=>saved.proposal_ids.includes(row.proposal_id)));
        if(!communityId) {
          const [setting,images,rooms]=await Promise.all([supabase.rpc("get_repeat_event_auto_publish_setting"),supabase.rpc("list_my_application_proposal_media"),supabase.rpc("list_communities")]);
          setPilot(!setting.error&&setting.data===true);setMediaReady(!images.error);
          const ownImages=((images.data??[]) as ApplicationProposalMedia[]).filter(item=>item.context_type==='member_event_proposal'&&saved.proposal_ids.includes(item.context_id));
          setMedia(await Promise.all(ownImages.map(async item=>{try{const signed=await supabase.storage.from("proposal-media").createSignedUrl(item.storage_path,3600);return {...item,image_url:signed.data?.signedUrl??null};}catch{return {...item,image_url:null};}})));
          setCommunities((rooms.data??[]).filter((item:{membership_status:string;membership_role:string})=>item.membership_status==='active'&&['owner','moderator','host'].includes(item.membership_role)));
          const ids=(drafts.data??[]).filter((row:MemberEventProposal)=>saved.proposal_ids.includes(row.proposal_id)).flatMap((row:MemberEventProposal)=>row.canonical_event_id?[row.canonical_event_id]:[]);
          const events=ids.length?await supabase.from("events").select("id").in("id",ids).in("status",["published","completed"]):{data:[],error:null};
          setPublished(events.error?[]:(events.data??[]).map((item:{id:string})=>item.id));
        }
      }
      setReady(true);
      return true;
    }catch(cause){setReady(false);setRows([]);setMessage(memberErrorMessage(cause,"open repeat dates"));return false;}
    finally{pending.current=false;setBusy(false);}
  }
  async function create() {
    if(pending.current||frequency==="none")return;
    const start=new Date(starts);
    if(!Number.isFinite(start.getTime())||start<=new Date()){setMessage("Choose a future date for the first repeat.");return;}
    pending.current=true;setBusy(true);setMessage("");
    requestId.current ||= crypto.randomUUID();
    try {
      const result=await supabase.rpc("plan_repeat_events",{p_event_id:eventId,p_community_id:communityId??null,p_frequency:frequency,p_count:Number(count),p_first_starts_at:start.toISOString(),p_request_id:requestId.current});
      if(result.error)throw result.error;
      if(!Array.isArray(result.data)||result.data.length!==Number(count))throw new Error("The repeat dates could not be confirmed. Refresh saved dates before trying again.");
      pending.current=false;const loaded=await load();
      if(!loaded){setMessage("Your dates were saved, but could not be opened. Choose Refresh saved dates before trying again.");return;}
      setMessage("Repeat dates saved as private drafts. Check each date and open it when ready. Guests book each event separately.");
    }catch(cause){setMessage(memberErrorMessage(cause,"plan repeat dates"));}
    finally{pending.current=false;setBusy(false);}
  }
  return <details className="event-repeat-planner" onToggle={event=>{if(event.currentTarget.open&&!opened){setOpened(true);void load();}}}>
    <summary>Repeat this {communityId?"gathering":"event"} <small>Optional</small></summary>
    {opened ? <div className="event-repeat-body">
      <p>Plan daily, weekly or monthly dates. Each starts as a private draft with its own guest limit, bookings and reminders. Check the time, venue and contact before opening each date.</p>
      {!communityId ? <p>The pilot allows two events to open automatically. Later repeat dates go to the team for review.</p> : null}
      {busy?<p role="status">Saving or opening repeat dates…</p>:null}
      {!plan&&ready?<div className="event-repeat-fields">
        <label>Repeat<select disabled={busy} value={frequency} onChange={event=>setFrequency(event.target.value)}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        {frequency!=="none"?<><label>First repeat starts<input type="datetime-local" disabled={busy} value={starts} onChange={event=>setStarts(event.target.value)}/></label><label>Number of new dates<input type="number" min={2} max={12} disabled={busy} value={count} onChange={event=>setCount(event.target.value)}/></label><button type="button" className="button button-primary" disabled={busy} onClick={()=>void create()}>Plan repeat dates</button></>:null}
      </div>:null}
      {plan ? <><p>{plan.proposal_ids.length} {plan.frequency} dates planned. Posters, bookings and private conversations are not copied.</p>
        {communityId ? <CommunityEditor communityId={communityId} communitySlug={communitySlug} currentUserId={currentUserId} migrationReady proposals={rows as CommunityEventProposal[]} onSaved={()=>void load()}/> : <>
          <label>Choose a date<select disabled={busy} value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a date to check</option>{rows.map(row=><option key={row.proposal_id} value={row.proposal_id}>{new Intl.DateTimeFormat("en-KE",{dateStyle:"medium",timeStyle:"short",timeZone:row.timezone}).format(new Date(row.starts_at))} · {row.status==='draft'?'Private draft':row.status.replaceAll('_',' ')}</option>)}</select></label>
          {selected ? <PublicEditor key={selected} initialEditingId={selected} proposals={rows.filter(row=>row.proposal_id===selected) as MemberEventProposal[]} hostEventIds={rows.flatMap(row=>row.canonical_event_id?[row.canonical_event_id]:[])} hostedCommunities={communities} media={media} mediaReady={mediaReady} migrationReady pilotAutoPublish={pilot} publishedEventIds={published} onSaved={()=>void load()}/>:null}
        </>}
      </>:null}
      {message?<p role="status">{message}</p>:null}
      <button type="button" className="button button-outline" disabled={busy} onClick={()=>void load()}>Refresh saved dates</button>
    </div>:null}
  </details>;
}
