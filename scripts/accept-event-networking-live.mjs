import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';

// Real, independent Auth/PostgREST sessions; not a browser/camera simulation.
// Provision only fresh, closed, community-audience [TEST] events. No Community
// links are created, so these records are invisible to public discovery.
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret=process.env.SUPABASE_SECRET_KEY,password=process.env.HAT_COMMUNITY_TEST_PASSWORD;
assert(url&&key&&secret&&password,'Local Supabase and tagged test credentials are required');
assert(process.env.HAT_PRIMARY_ADMIN_EMAIL&&process.env.HAT_PRIMARY_ADMIN_PASSWORD,'An existing owner login is required for audited fixture cleanup only');
assert.equal(process.env.HAT_CONFIRM_NETWORKING_REHEARSAL,'yes','Set HAT_CONFIRM_NETWORKING_REHEARSAL=yes to run the isolated live write rehearsal');
assert.equal(new URL(url).hostname,'gtzwqromwvzqytygebfc.supabase.co','Refuse to write to an unexpected project');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',signal:init?.signal??AbortSignal.timeout(20000)})}};
const service=createClient(url,secret,options),anonymous=createClient(url,key,options),cleanupOwner=createClient(url,key,options);
const labels={host:'community.host@hat-test.invalid',helperOne:'community.moderator@hat-test.invalid',helperTwo:'community.scale@hat-test.invalid',guestOne:'community.member.one@hat-test.invalid',guestTwo:'community.member.two@hat-test.invalid'};
const identities={},events=[],orders=[],checks=[],snapshots=[],pairs=new Map();
const runId=randomUUID(),slug=`hat-networking-rehearsal-${runId}`;
const venueId=randomUUID(),createdAt=new Date().toISOString();
let provisionedVenue=false,failed=null,cleanupComplete=false,interrupted=false;
mkdirSync(new URL('../tmp/',import.meta.url),{recursive:true});
const reportPath=new URL(`../tmp/networking-api-rehearsal-${runId}.json`,import.meta.url);
function checkpoint(){writeFileSync(reportPath,JSON.stringify({run_id:runId,started_at:createdAt,event_ids:events,event_slugs:events.map((_,i)=>`${slug}-${i+1}`),checks,snapshots,result:'in_progress',cleanup_complete:false,secrets_printed:false},null,2));}
const check=(ok,label)=>{assert(ok,label);checks.push({label,result:'pass',at:new Date().toISOString()});checkpoint();console.log(`PASS: ${label}`);};
process.once('SIGINT',()=>{interrupted=true;});process.once('SIGTERM',()=>{interrupted=true;});
async function rpc(client,name,args={}){const r=await client.rpc(name,args);if(r.error)throw Error(`${name}: ${r.error.code??'unavailable'}`);return r.data;}
async function denied(client,name,args){const r=await client.rpc(name,args);return Boolean(r.error);}
async function insert(table,value){const r=await service.from(table).insert(value);if(r.error)throw Error(`Fixture ${table}: ${r.error.code??'unavailable'}`);}
async function update(table,value,column,ids){const r=await service.from(table).update(value).in(column,ids);if(r.error)throw Error(`Cleanup ${table}: ${r.error.code??'unavailable'}`);}
async function state(identity,eventId=events[0]){return rpc(identity.client,'get_event_networking',{p_event_id:eventId});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let guestLabels=['guestOne','guestTwo','helperTwo'];
try{
  const ownerLogin=await cleanupOwner.auth.signInWithPassword({email:process.env.HAT_PRIMARY_ADMIN_EMAIL,password:process.env.HAT_PRIMARY_ADMIN_PASSWORD});
  assert(!ownerLogin.error&&(await rpc(cleanupOwner,'get_my_active_admin_role'))==='super_admin','Owner cleanup access must be verified before provisioning');
  for(const [label,email] of Object.entries(labels)){
    const client=createClient(url,key,options),signed=await client.auth.signInWithPassword({email,password});
    assert(!signed.error&&signed.data.user,`Tagged ${label} sign-in failed`);
    identities[label]={client,id:signed.data.user.id,email};
    const profile=await service.from('profiles').select('is_test_account,access_status,visibility_paused').eq('id',signed.data.user.id).single();
    assert(!profile.error&&profile.data.is_test_account&&profile.data.access_status==='active'&&!profile.data.visibility_paused,`Refuse to use non-test/inactive ${label}`);
    const roles=await service.from('user_roles').select('role').eq('user_id',signed.data.user.id);
    assert(!roles.error&&!(roles.data??[]).some(r=>r.role==='super_admin'),`Rehearsal ${label} must not be Super Admin`);
  }
  check(true,'five existing tagged accounts authenticated; no password, role or profile changes');
  const host=identities.host;
  await insert('venues',{id:venueId,name:'[TEST] Networking rehearsal room',city:'Nairobi',country:'Kenya',address_line:'[TEST] No physical venue; API acceptance only'});provisionedVenue=true;
  const serverNow=Date.parse((await rpc(host.client,'get_my_networking_updates')).server_now);
  assert(Number.isFinite(serverNow),'Authoritative server clock required');
  const starts=new Date(serverNow-60000).toISOString(),ends=new Date(serverNow+40*60000).toISOString();
  for(let n=0;n<2;n++){
    const id=randomUUID();
    await insert('events',{id,slug:`${slug}-${n+1}`,title:`[TEST] Private networking rehearsal ${n+1}`,summary:'Isolated tagged-account API rehearsal. Not a real gathering.',format:'in_person',audience:'community',status:'published',registration_mode:'closed',starts_at:starts,ends_at:ends,timezone:'Africa/Nairobi',venue_id:venueId,created_by:host.id,capacity:10});events.push(id);checkpoint();
    await insert('event_hosts',{event_id:id,user_id:host.id,status:'active',assigned_by:host.id});
  }
  // All participant orders are explicitly zero-value test records; no payment
  // provider, purchase, split, refund or finance operation is invoked.
  for(const [eventId,guests] of [[events[0],guestLabels],[events[1],['guestOne']]])for(const label of guests){
    const id=randomUUID();await insert('orders',{id,user_id:identities[label].id,event_id:eventId,status:'approved',processing_mode:'manual_review',currency:'KES',subtotal_minor:0,total_minor:0});orders.push(id);
    await insert('event_memberships',{event_id:eventId,user_id:identities[label].id,status:'confirmed',order_id:id});
  }
  check((await rpc(anonymous,'can_view_event',{p_event_id:events[0]}))===false,'anonymous event visibility denied');
  const outsider=createClient(url,key,options);check(await denied(outsider,'get_my_event_arrival',{p_event_id:events[0]}),'signed-out attendance denied');
  for(const label of ['helperOne','helperTwo'])await rpc(host.client,'manage_my_event_door_helper',{p_event_id:events[0],p_email:identities[label].email,p_action:'assign'});
  check((await rpc(identities.helperOne.client,'get_my_event_door',{p_slug:`${slug}-1`})).length===1,'Host assigned helper without Super Admin');
  check((await rpc(identities.helperOne.client,'get_my_event_door',{p_slug:`${slug}-2`})).length===0,'helper cannot open simultaneous unassigned event');
  check(await denied(identities.helperOne.client,'get_my_event_arrival_export',{p_slug:`${slug}-1`}),'helper cannot download guest attendance');
  const passes={};for(const label of guestLabels)passes[label]=(await rpc(identities[label].client,'get_my_event_pass',{p_event_id:events[0]}))[0];
  const other=(await rpc(identities.guestOne.client,'get_my_event_pass',{p_event_id:events[1]}))[0];
  check((await rpc(identities.helperOne.client,'door_check_in_event_member',{p_event_id:events[0],p_credential:other.qr_payload,p_method:'qr',p_device_label:'[TEST] Helper one'}))[0].outcome==='not_found','wrong-event QR rejected through actual helper session');
  for(const [index,label] of guestLabels.entries()){
    const helper=identities[index%2?'helperTwo':'helperOne'];
    const result=await rpc(helper.client,'door_check_in_event_member',{p_event_id:events[0],p_credential:index===1?passes[label].manual_code:passes[label].qr_payload,p_method:index===1?'manual':'qr',p_device_label:'[TEST] API helper'});
    check(result[0].outcome==='checked_in',`${label} arrival saved through assigned helper`);
  }
  check((await rpc(identities.helperOne.client,'door_check_in_event_member',{p_event_id:events[0],p_credential:passes.guestOne.qr_payload,p_method:'qr',p_device_label:'[TEST] Repeat'}))[0].outcome==='already_checked_in','duplicate scan does not create another arrival');
  let attendance=await rpc(host.client,'get_my_event_arrival',{p_event_id:events[0]});
  check(attendance.arrived===3&&attendance.activity.reduce((n,a)=>n+a.checked_in,0)===3,'Host totals and operator activity reconcile after fresh request');
  const exportData=await rpc(host.client,'get_my_event_arrival_export',{p_slug:`${slug}-1`});
  check(exportData.guests.length===3&&exportData.guests.every(g=>g.checked_in_by&&!('email'in g)&&!('manual_code'in g)),'attendance export contains operator attribution but no emails or pass secrets');
  await rpc(host.client,'manage_my_event_door_helper',{p_event_id:events[0],p_email:identities.helperOne.email,p_action:'remove'});
  check(await denied(identities.helperOne.client,'door_check_in_event_member',{p_event_id:events[0],p_credential:passes.guestOne.manual_code,p_method:'manual'}),'removed helper immediately denied with same Auth session');
  const scheduleNow=Date.parse((await rpc(host.client,'get_my_networking_updates')).server_now);
  const begin=new Date(scheduleNow-1000).toISOString(),finish=new Date(scheduleNow+12*60000).toISOString();
  await rpc(host.client,'save_event_networking',{p_event_id:events[0],p_starts_at:begin,p_ends_at:finish,p_minutes:2,p_changeover:30,p_points:['Test Table 1','Test Table 2'],p_prompt:'[TEST] What are you working on?'});
  await rpc(host.client,'control_event_networking',{p_event_id:events[0],p_action:'start'});
  check((await rpc(identities.guestOne.client,'get_my_networking_updates')).live.some(e=>e.event_id===events[0]),'checked-in guest receives live reminder');
  check(!(await state(identities.guestOne)).joined,'reminder lookup does not join networking');
  await rpc(host.client,'control_event_networking',{p_event_id:events[0],p_action:'pause'});
  check(!(await rpc(identities.guestOne.client,'get_my_networking_updates')).live.some(e=>e.event_id===events[0]),'Host pause removes live reminder');
  await rpc(host.client,'control_event_networking',{p_event_id:events[0],p_action:'resume'});
  for(const label of guestLabels.slice(0,2))await rpc(identities[label].client,'join_event_networking',{p_event_id:events[0],p_join:true,p_introduction:'[TEST] I am taking part in the networking rehearsal.'});
  // Third guest joins after the first pair is active to exercise late arrival.
  let lateJoined=false,lastRound=0,pausedRead=null,firstActiveAt=null,clockChecked=false;
  const accepted=new Set(),deadline=performance.now()+10*60000;
  let lastObserved=performance.now();
  while(performance.now()<deadline){
    assert(!interrupted,'Rehearsal interrupted; running audited cleanup');
    assert(performance.now()-lastObserved<45000,'Rehearsal observer was paused; timed rotation cannot be accepted from this run');
    const visible=lateJoined?guestLabels:guestLabels.slice(0,2);
    const states=await Promise.all(visible.map(async label=>[label,await state(identities[label])]));
    lastObserved=performance.now();
    snapshots.push({elapsed_ms:Math.round(performance.now()-(deadline-10*60000)),server_now:states[0][1].server_now,round:states[0][1].session.round_no,status:states[0][1].session.status,matches:states.map(([label,s])=>({label,match_id:s.match?.id??null,state:s.match?.status??null,met_count:s.met?.length??0,notice:Boolean(s.end_notice)}))});checkpoint();
    for(const [label,s] of states){
      if(s.session.round_no!==lastRound){lastRound=s.session.round_no;console.log(`PROGRESS: real server round ${lastRound}`);}
      if(s.match){
        const key=s.match.id,entry=pairs.get(key)??{id:key,labels:new Set(),round:s.session.round_no,ends_at:s.match.ends_at,completed:false};entry.labels.add(label);pairs.set(key,entry);
        if(s.match.status==='offered'&&!s.match.accepted&&!accepted.has(`${key}:${label}`)){
          await rpc(identities[label].client,'answer_event_networking',{p_event_id:events[0],p_match_id:key,p_accept:true});accepted.add(`${key}:${label}`);
        }
        if(s.match.status==='active'&&!firstActiveAt){firstActiveAt=performance.now();pausedRead={label,matchId:key,ends_at:s.match.ends_at};}
      }
      for(const met of s.met??[])if(pairs.has(met.match_id))pairs.get(met.match_id).completed=true;
    }
    if(firstActiveAt&&!lateJoined){await rpc(identities.helperTwo.client,'join_event_networking',{p_event_id:events[0],p_join:true,p_introduction:'[TEST] I joined after the first introduction.'});lateJoined=true;check(true,'third guest joins during the first round');}
    if(pausedRead&&!clockChecked&&performance.now()-firstActiveAt>30000){const fresh=await state(identities[pausedRead.label]);check(fresh.match?.id===pausedRead.matchId&&fresh.match?.ends_at===pausedRead.ends_at,'fresh client request preserves shared match end time');clockChecked=true;}
    const completed=[...pairs.values()].filter(p=>p.completed);
    if(completed.length>=3){
      check(completed.every(p=>p.labels.size===2),'each completed introduction observed by both guest sessions');
      const combinations=completed.map(p=>[...p.labels].sort().join(':'));
      check(new Set(combinations).size===3,'three real timed rounds completed with no repeated pair');break;
    }
    await sleep(10000);
  }
  check([...pairs.values()].filter(p=>p.completed).length>=3,'three completed introductions persisted before timeout');
  await rpc(identities.guestOne.client,'event_networking_help',{p_event_id:events[0],p_note:'[TEST] Help request from isolated API rehearsal.'});
  const help=(await state(host)).help?.find(h=>h.note==='[TEST] Help request from isolated API rehearsal.');check(Boolean(help),'help reaches Host panel');
  await rpc(host.client,'resolve_event_networking_help',{p_event_id:events[0],p_help_id:help.id});
  check(!(await state(host)).help?.some(h=>h.id===help.id),'Host resolves help and fresh read confirms');
  const relationships=await rpc(identities.guestOne.client,'get_my_networking_connection_states',{p_event_id:events[0]});
  check(relationships.length===2,'completed-pair relationship states reload without sending a connection');
  await rpc(host.client,'control_event_networking',{p_event_id:events[0],p_action:'finish'});
  check((await state(identities.guestOne)).session.status==='finished','Host finishes without Super Admin approval');
}catch(error){failed=String(error.message??'Rehearsal failed');console.error(`REHEARSAL FAILED: ${failed}`);}
finally{
  // Never delete existing accounts, relationships, global settings or records
  // outside the freshly generated IDs. Cancelled fixtures retain audit evidence.
  const cleanupErrors=[];
  if(events.length){
    try{
      const scope=await service.from('events').select('id,slug,audience,registration_mode').in('id',events);
      const participants=await service.from('event_memberships').select('user_id').in('event_id',events);
      const money=await service.from('orders').select('total_minor,user_id').in('event_id',events);
      const allowed=new Set(Object.values(identities).map(i=>i.id));
      assert(!scope.error&&scope.data.length===events.length&&scope.data.every(e=>e.slug.startsWith(slug+'-')&&e.audience==='community'&&e.registration_mode==='closed'),'Cleanup fixture scope mismatch');
      assert(!participants.error&&!money.error&&participants.data.every(m=>allowed.has(m.user_id))&&money.data.every(o=>Number(o.total_minor)===0&&allowed.has(o.user_id)),'Cleanup may only affect tagged zero-value fixtures');
      for(const id of events){
        const finish=await cleanupOwner.rpc('control_event_networking',{p_event_id:id,p_action:'finish'});
        if(finish.error&&finish.error.message!=='Save a networking session first')cleanupErrors.push('session_finish');
        for(const label of ['helperOne','helperTwo'])if(identities[label])await rpc(cleanupOwner,'manage_my_event_door_helper',{p_event_id:id,p_email:identities[label].email,p_action:'remove'});
        await rpc(cleanupOwner,'manage_event_lifecycle',{p_event_id:id,p_action:'cancel',p_reason:'[TEST] Isolated networking API rehearsal completed; close fixtures.',p_member_message:'[TEST] Internal rehearsal closed. No real event is affected.'});
      }
      await update('event_hosts',{status:'paused'},'event_id',events);
      const [closed,places,orderStates]=await Promise.all([service.from('events').select('id,status').in('id',events),service.from('event_memberships').select('status').in('event_id',events),service.from('orders').select('status').in('event_id',events)]);
      assert(!closed.error&&!places.error&&!orderStates.error&&closed.data.length===events.length&&closed.data.every(e=>e.status==='cancelled')&&places.data.every(p=>p.status==='cancelled')&&orderStates.data.every(o=>o.status==='cancelled'),'Verify cancelled fixture state after cleanup');
    }catch{cleanupErrors.push('audited_fixture_cleanup');}
  }
  for(const identity of Object.values(identities))await identity.client.auth.signOut({scope:'local'}).catch(()=>{});
  await cleanupOwner.auth.signOut({scope:'local'}).catch(()=>{});
  cleanupComplete=cleanupErrors.length===0;
  const report={run_id:runId,started_at:createdAt,finished_at:new Date().toISOString(),mode:'real multi-session API; NOT physical camera/browser/inbox acceptance',event_slugs:events.map((_,i)=>`${slug}-${i+1}`),checks,snapshots,completed_introductions:[...pairs.values()].filter(p=>p.completed).map(p=>({round:p.round,participants:[...p.labels].sort()})),result:failed||!cleanupComplete?'failed':'passed',failure:failed,cleanup_complete:cleanupComplete,cleanup_errors:cleanupErrors,venue_retained:provisionedVenue,scope:'Only fresh private closed test event records. Existing users, profile fields, roles and relationships unchanged. Owner session used only for audited fixture closure.',remaining:['physical iOS/Android QR camera','browser/PWA interaction and phone lock','real provider/inbox delivery','paid-order eligibility through PSP sandbox']};
  mkdirSync(new URL('../tmp/',import.meta.url),{recursive:true});writeFileSync(new URL(`../tmp/networking-api-rehearsal-${runId}.json`,import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify({result:report.result,checks:checks.length,completed_introductions:report.completed_introductions.length,cleanup_complete:cleanupComplete,report:`tmp/networking-api-rehearsal-${runId}.json`,secrets_printed:false}));
}
if(failed||!cleanupComplete)process.exitCode=2;
