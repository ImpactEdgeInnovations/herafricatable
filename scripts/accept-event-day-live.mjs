// Real Auth/API acceptance using only tagged accounts and one closed fixture.
// No provider email, passwords, roles or real event records are changed.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(url&&key&&process.env.SUPABASE_SECRET_KEY&&process.env.HAT_COMMUNITY_TEST_PASSWORD,'Local test configuration required');
assert.equal(new URL(url).hostname,'gtzwqromwvzqytygebfc.supabase.co');
assert.equal(process.env.HAT_CONFIRM_EVENT_DAY_REHEARSAL,'yes','Explicit isolated rehearsal opt-in required');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(20000)})}};
const service=createClient(url,process.env.SUPABASE_SECRET_KEY,options),owner=createClient(url,key,options),clients=[];
const id=randomUUID(),slug=`hat-event-day-rehearsal-${id}`,orderId=randomUUID(),venueId=randomUUID();
let created=false,failed=null,cleanup=false,host;const checks=[];
const check=(condition,label)=>{assert(condition,label);checks.push(label);console.log(`PASS: ${label}`);};
async function rpc(client,name,args){const r=await client.rpc(name,args);if(r.error)throw Error(`${name}:${r.error.code}`);return r.data;}
async function insert(table,row){const r=await service.from(table).insert(row);if(r.error)throw Error(`${table}:${r.error.code}`);}
async function login(email){
  const client=createClient(url,key,options);clients.push(client);
  const result=await client.auth.signInWithPassword({email,password:process.env.HAT_COMMUNITY_TEST_PASSWORD});assert(!result.error&&result.data.user,'Tagged test sign-in failed');
  const profile=await service.from('profiles').select('is_test_account,access_status').eq('id',result.data.user.id).single();assert(!profile.error&&profile.data.is_test_account&&profile.data.access_status==='active','Only active tagged accounts may participate');
  return {client,id:result.data.user.id};
}
try{
  const ownerLogin=await owner.auth.signInWithPassword({email:process.env.HAT_PRIMARY_ADMIN_EMAIL,password:process.env.HAT_PRIMARY_ADMIN_PASSWORD});
  assert(!ownerLogin.error&&(await rpc(owner,'get_my_active_admin_role'))==='super_admin','Existing owner cleanup access required');
  host=await login('community.host@hat-test.invalid');
  const guest=await login('community.member.one@hat-test.invalid'),other=await login('community.member.two@hat-test.invalid'),helper=await login('community.moderator@hat-test.invalid');
  const clock=Date.parse((await rpc(host.client,'get_my_networking_updates')).server_now);
  await insert('venues',{id:venueId,name:'[TEST] Event day room',city:'Nairobi',country:'Kenya',address_line:'[TEST] No physical event — API rehearsal only'});
  await insert('events',{id,slug,title:'[TEST] Private Event day rehearsal',summary:'Internal isolated API acceptance only.',format:'in_person',audience:'community',registration_mode:'closed',status:'published',venue_id:venueId,starts_at:new Date(clock-600000).toISOString(),ends_at:new Date(clock+7200000).toISOString(),created_by:host.id,capacity:1});created=true;
  await insert('event_hosts',{event_id:id,user_id:host.id,status:'active',assigned_by:host.id});
  await insert('orders',{id:orderId,user_id:guest.id,event_id:id,status:'approved',processing_mode:'manual_review',currency:'KES',subtotal_minor:0,total_minor:0});
  await insert('event_memberships',{event_id:id,user_id:guest.id,status:'confirmed',order_id:orderId});
  check((await rpc(guest.client,'get_my_event_attendance_plan',{p_event_id:id})).status==='as_planned','confirmed guest starts with attending as planned');
  const before=await rpc(guest.client,'get_my_event_pass',{p_event_id:id});
  await rpc(guest.client,'set_my_event_attendance_plan',{p_event_id:id,p_status:'running_late',p_note:'[TEST] Arriving at 7 pm.'});
  const freshGuest=await login('community.member.one@hat-test.invalid');
  check((await rpc(freshGuest.client,'get_my_event_attendance_plan',{p_event_id:id})).note==='[TEST] Arriving at 7 pm.','saved note survives a fresh authenticated session');
  let day=await rpc(host.client,'get_event_day_overview',{p_event_id:id});
  check(day.confirmed===1&&day.checked_in===0&&day.not_checked_in===1&&day.running_late===1,'Host sees canonical arrival counts and late subset');
  check(day.guests[0].note==='[TEST] Arriving at 7 pm.','Host sees privately shared note');
  await rpc(host.client,'manage_my_event_door_helper',{p_event_id:id,p_email:'community.moderator@hat-test.invalid',p_action:'assign'});
  check((await helper.client.rpc('get_event_day_overview',{p_event_id:id})).error?.code==='P0001','assigned scanner helper cannot read private dashboard');
  check((await other.client.rpc('get_my_event_attendance_plan',{p_event_id:id})).error?.code==='P0001','unregistered member cannot read guest attendance plan');
  check((await other.client.rpc('get_event_networking_live_counts',{p_event_id:id})).error?.code==='P0001','unrelated member cannot read networking counts');
  await rpc(guest.client,'set_my_event_attendance_plan',{p_event_id:id,p_status:'not_attending',p_note:'[TEST] Cannot attend.'});
  day=await rpc(host.client,'get_event_day_overview',{p_event_id:id,p_filter:'not_attending'});
  check(day.not_attending===1&&day.not_checked_in===1&&day.guests.length===1,'absence update appears without pretending guest checked in');
  const after=await rpc(guest.client,'get_my_event_pass',{p_event_id:id});
  check(before[0].qr_payload===after[0].qr_payload,'absence update does not invalidate or replace entry pass');
  const membership=await service.from('event_memberships').select('status,order_id').eq('event_id',id).eq('user_id',guest.id).single();
  const order=await service.from('orders').select('status').eq('id',orderId).single();
  check(!membership.error&&membership.data.status==='confirmed'&&!order.error&&order.data.status==='approved','booking and payment state unchanged');
  check((await rpc(owner,'get_event_day_overview',{p_event_id:id})).not_attending===1,'authorised Super Admin sees the same event-scoped update');
  await rpc(guest.client,'set_my_event_attendance_plan',{p_event_id:id,p_status:'as_planned',p_note:''});
  check((await rpc(host.client,'get_event_day_overview',{p_event_id:id})).not_attending===0,'guest can clear absence update');
  await rpc(host.client,'save_event_networking',{p_event_id:id,p_starts_at:new Date(clock+600000).toISOString(),p_ends_at:new Date(clock+2400000).toISOString(),p_minutes:5,p_changeover:60,p_points:['Table 1'],p_prompt:'[TEST] Hello'});
  check((await rpc(host.client,'get_event_networking_live_counts',{p_event_id:id})).counts===null,'scheduled networking is not displayed as live zero counts');
  await rpc(host.client,'manage_my_event_door_helper',{p_event_id:id,p_email:'community.moderator@hat-test.invalid',p_action:'remove'});
}catch(error){failed=error.message;console.error(`Event day rehearsal failed: ${failed}`);}
finally{
  if(created)try{
    const event=await service.from('events').select('slug,audience,registration_mode').eq('id',id).single();
    const orders=await service.from('orders').select('total_minor').eq('event_id',id);
    assert(!event.error&&event.data.slug===slug&&event.data.audience==='community'&&event.data.registration_mode==='closed'&&!orders.error&&orders.data.every(o=>Number(o.total_minor)===0));
    await rpc(owner,'manage_event_lifecycle',{p_event_id:id,p_action:'cancel',p_reason:'[TEST] Private Event day acceptance complete.',p_member_message:'[TEST] Internal fixture closed. No real event affected.'});
    const closed=await service.from('events').select('status').eq('id',id).single();assert(!closed.error&&closed.data.status==='cancelled');
    const paused=await service.from('event_hosts').update({status:'paused'}).eq('event_id',id);assert(!paused.error);cleanup=true;
  }catch{failed??='audited_cleanup_unconfirmed';}else cleanup=true;
  for(const client of [...clients,owner])await client.auth.signOut({scope:'local'}).catch(()=>{});
  mkdirSync('tmp',{recursive:true});const report={result:failed?'failed':'passed',checks,cleanup_complete:cleanup,failure:failed,event_slug:slug,mode:'real independent Auth/API sessions; not a physical-device or browser-interaction claim',emails_sent:0};
  writeFileSync(`tmp/event-day-api-rehearsal-${id}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,checks:checks.length,cleanup_complete:cleanup,emails_sent:0}));
}
if(failed)process.exitCode=2;
