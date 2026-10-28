// Explicit isolated live writes; no provider email, password or role changes.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {PDFDocument} from 'pdf-lib';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert(url&&key&&process.env.SUPABASE_SECRET_KEY&&process.env.HAT_COMMUNITY_TEST_PASSWORD,'Local test configuration required');
assert.equal(new URL(url).hostname,'gtzwqromwvzqytygebfc.supabase.co');
assert.equal(process.env.HAT_CONFIRM_TICKET_REHEARSAL,'yes','Explicit isolated rehearsal opt-in required');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(20000)})}};
const service=createClient(url,process.env.SUPABASE_SECRET_KEY,options),owner=createClient(url,key,options),sessions=[];
const id=randomUUID(),slug=`hat-ticket-rehearsal-${id}`,orderId=randomUUID(),ticketId=randomUUID();
let created=false,failed=null,cleanup=false;const checks=[];
const check=(condition,label)=>{assert(condition,label);checks.push(label);console.log(`PASS: ${label}`);};
async function rpc(client,name,args){const r=await client.rpc(name,args);if(r.error)throw Error(`${name}:${r.error.code}`);return r.data;}
async function insert(table,row){const r=await service.from(table).insert(row);if(r.error)throw Error(`${table}:${r.error.code}`);}
async function login(email){
  const jar=new Map(),client=createServerClient(url,key,{...options,cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>value?jar.set(name,value):jar.delete(name))}});
  sessions.push(client);const result=await client.auth.signInWithPassword({email,password:process.env.HAT_COMMUNITY_TEST_PASSWORD});assert(!result.error&&result.data.user,'Tagged test sign-in failed');
  const profile=await service.from('profiles').select('is_test_account,access_status').eq('id',result.data.user.id).single();assert(!profile.error&&profile.data.is_test_account&&profile.data.access_status==='active','Only active tagged accounts may participate');
  return {client,id:result.data.user.id,cookie:()=>[...jar].map(([n,v])=>`${encodeURIComponent(n)}=${encodeURIComponent(v)}`).join('; ')};
}
try{
  const loginOwner=await owner.auth.signInWithPassword({email:process.env.HAT_PRIMARY_ADMIN_EMAIL,password:process.env.HAT_PRIMARY_ADMIN_PASSWORD});assert(!loginOwner.error&&(await rpc(owner,'get_my_active_admin_role'))==='super_admin','Existing owner cleanup access required');
  const host=await login('community.host@hat-test.invalid'),guest=await login('community.member.one@hat-test.invalid'),other=await login('community.member.two@hat-test.invalid');
  const clock=Date.parse((await rpc(host.client,'get_my_networking_updates')).server_now);
  await insert('events',{id,slug,title:'[TEST] Private PDF ticket rehearsal',summary:'Internal isolated API acceptance only.',format:'in_person',audience:'community',registration_mode:'closed',status:'published',starts_at:new Date(clock+86400000).toISOString(),ends_at:new Date(clock+90000000).toISOString(),created_by:host.id,capacity:2});created=true;
  await insert('event_hosts',{event_id:id,user_id:host.id,status:'active',assigned_by:host.id});
  await rpc(host.client,'save_event_host_public_details',{p_event_id:id,p_details:{display_name:'[TEST] Host',organisation_name:'[TEST] Organising team',enabled:true}});
  await insert('ticket_types',{id:ticketId,event_id:id,name:'[TEST] Free place',price_minor:0,currency:'KES',inventory_quantity:2,status:'on_sale'});
  await insert('orders',{id:orderId,user_id:guest.id,event_id:id,status:'approved',processing_mode:'manual_review',currency:'KES',subtotal_minor:0,total_minor:0});
  await insert('event_memberships',{event_id:id,user_id:guest.id,status:'confirmed',order_id:orderId,ticket_type_id:ticketId});
  const fulfilled=await service.from('orders').update({status:'fulfilled',fulfilled_at:new Date().toISOString()}).eq('id',orderId);assert(!fulfilled.error);
  const base='https://www.herafricatable.com',download=`${base}/events/${slug}/ticket.pdf`;
  const get=cookie=>fetch(download,{headers:cookie?{cookie}:{},redirect:'manual',signal:AbortSignal.timeout(30000)});
  let response=await get();check(response.status===401,'anonymous download denied');
  response=await get(other.cookie());check(response.status===404,'other member cannot download the guest ticket');
  response=await get(guest.cookie());check(response.status===200,'own confirmed guest downloads PDF through live HTTPS route');
  check(response.headers.get('content-type')==='application/pdf'&&response.headers.get('cache-control').includes('no-store'),'PDF content type and private cache headers');
  const bytes=new Uint8Array(await response.arrayBuffer());check((await PDFDocument.load(bytes)).getPageCount()===1,'download is a real one-page PDF with server font assets');
  const ticket=await rpc(guest.client,'get_my_event_ticket',{p_slug:slug});check(ticket.host_name==='[TEST] Host'&&ticket.organisation_name==='[TEST] Organising team','shared Host and company read through guest session');
  const jobs=await service.from('notification_jobs').select('id,to_email').eq('dedupe_key',`order-status:${orderId}:fulfilled`).eq('user_id',guest.id).single();assert(!jobs.error&&jobs.data.to_email.endsWith('.invalid'));
  const claimed=await service.from('notification_jobs').update({status:'processing',locked_at:new Date().toISOString()}).eq('id',jobs.data.id).eq('status','queued');assert(!claimed.error);
  const attachment=await rpc(service,'get_event_ticket_email',{p_job_id:jobs.data.id});check(attachment.qr_payload===ticket.qr_payload&&attachment.booking_reference===ticket.booking_reference,'claimed confirmation attachment uses the same private pass and order');
  const suppressed=await service.from('notification_jobs').update({status:'suppressed',locked_at:null,last_error:'test_rehearsal_no_provider_send'}).eq('id',jobs.data.id);assert(!suppressed.error);
}catch(error){failed=error.message;console.error(`Ticket rehearsal failed: ${failed}`);}
finally{
  if(created)try{
    const event=await service.from('events').select('slug,audience,registration_mode').eq('id',id).single();
    const orders=await service.from('orders').select('user_id,total_minor').eq('event_id',id);
    assert(!event.error&&event.data.slug===slug&&event.data.audience==='community'&&event.data.registration_mode==='closed'&&!orders.error&&orders.data.every(o=>Number(o.total_minor)===0));
    await rpc(owner,'manage_event_lifecycle',{p_event_id:id,p_action:'cancel',p_reason:'[TEST] Private PDF ticket acceptance complete.',p_member_message:'[TEST] Internal fixture closed. No real event affected.'});
    const closed=await service.from('events').select('status').eq('id',id).single();assert(!closed.error&&closed.data.status==='cancelled');
    const paused=await service.from('event_hosts').update({status:'paused'}).eq('event_id',id);assert(!paused.error);cleanup=true;
  }catch{failed??='audited_cleanup_unconfirmed';}
  else cleanup=true;
  for(const client of [...sessions,owner])await client.auth.signOut({scope:'local'}).catch(()=>{});
  mkdirSync('tmp',{recursive:true});const report={result:failed?'failed':'passed',checks,cleanup_complete:cleanup,failure:failed,event_slug:slug,mode:'real Auth/HTTPS API; no browser/camera/inbox claim',emails_sent:0,secrets_printed:false};writeFileSync(`tmp/ticket-api-rehearsal-${id}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,checks:checks.length,cleanup_complete:cleanup,emails_sent:0}));
}
if(failed)process.exitCode=2;
