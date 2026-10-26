import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { networkingCountdown, networkingStartCountdown, networkingPhase, networkingRemaining } from '../lib/events/networking.ts';
import { formatEventTimeInput, parseEventTimeInput } from '../lib/events/zoned-datetime.ts';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const compile = source => ts.transpileModule(source.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
const source = compile(read('components/events/event-networking.tsx'));
const base = { server_now: '2030-01-01T15:00:00Z', can_manage: false, eligible: true, joined: true, introduction: 'I run a business',
  session: { starts_at:'2030-01-01T15:00:00Z', ends_at:'2030-01-01T15:30:00Z', minutes:5, changeover:60, status:'running', disabled:false, round_no:1, round_ends_at:'2030-01-01T15:05:00Z', next_at:'2030-01-01T15:06:00Z', prompt:'What are you building?', points:['Table 1'] },
  match: { id:'match-1', status:'offered', point:'Table 1', ends_at:'2030-01-01T15:05:00Z', accept_by:'2030-01-01T15:00:30Z', accepted:false, person:{ name:'Amina', introduction:'Building a food business', avatar_url:null } }, met:[] };
assert.equal(networkingCountdown(272), '04:32');
assert.equal(networkingStartCountdown(3661),'1h 1m');assert.equal(networkingStartCountdown(90000),'1d 1h');
assert.equal(networkingRemaining(base.match.ends_at, Date.parse(base.server_now)),300);
assert.equal(networkingRemaining(base.match.ends_at, Date.parse(base.match.ends_at)+1000),0);
assert.equal(networkingPhase(base,Date.parse(base.server_now)),'offered');
assert.equal(networkingPhase({...base,match:{...base.match,status:'active'}},Date.parse(base.server_now)),'talking');
assert.equal(networkingPhase({...base,session:{...base.session,disabled:true}},Date.parse(base.server_now)),'disabled');
assert.equal(networkingPhase({...base,session:{...base.session,status:'paused'}},Date.parse(base.server_now)),'paused');
assert.equal(networkingPhase(base,Date.parse(base.session.ends_at)),'finished');
assert.equal(networkingPhase({...base,match:null},Date.parse('2030-01-01T15:05:01Z')),'changeover');
assert.equal(networkingPhase(base,Date.parse('2030-01-01T15:00:31Z')),'waiting','expired offer cannot be accepted through stale UI');

const flush = async () => { for(let i=0;i<5;i++) await new Promise(resolve => setImmediate(resolve)); };
function harness(initial = base) {
  let current=structuredClone(initial), fail=false, mutationError=false, cursor=0, values=[], effects=[], intervalId=0;
  const calls=[], intervals=new Map(), listeners=new Map();
  const client={ rpc:async(name,args)=>{calls.push({name,args}); if(fail) throw Error('offline'); if(name==='get_event_networking')return {data:current,error:null}; if(mutationError)throw Error('write failed'); return {data:null,error:null}; } };
  const state=initialValue=>{const i=cursor++; if(!(i in values))values[i]=typeof initialValue==='function'?initialValue():initialValue; return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];};
  const ref=v=>{const i=cursor++; return values[i]??=( {current:v} );};
  const doc={hidden:false,addEventListener:(name,fn)=>listeners.set('doc:'+name,fn),removeEventListener:name=>listeners.delete('doc:'+name)};
  const win={addEventListener:(name,fn)=>listeners.set('win:'+name,fn),removeEventListener:name=>listeners.delete('win:'+name)};
  const deps={React,useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useMemo:fn=>fn(),useRef:ref,useState:state,createClient:()=>client,
    memberErrorMessage:()=> 'Please try again.',useActionDialog:()=>({ask:async()=>({note:'We met during networking.'}),dialog:null}),
    formatEventTimeInput,parseEventTimeInput,networkingCountdown,networkingStartCountdown,networkingPhase,networkingRemaining,
    styles:new Proxy({},{get:(_,key)=>String(key)}),document:doc,window:win,performance,
    setInterval:fn=>{intervals.set(++intervalId,fn);return intervalId;},clearInterval:id=>intervals.delete(id)};
  const Component=new Function(...Object.keys(deps),`${source};return EventNetworking;`)(...Object.values(deps));
  function render(manage=false){cursor=0;effects=[];return Component({eventId:'event',timeZone:'Africa/Nairobi',initial,manage});}
  let tree=render(); const cleanup=effects.map(fn=>fn());
  function elements(node){if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(elements)];}
  function button(label,manage=false){return elements(render(manage)).find(e=>e.type==='button'&&text(e)===label);}
  function text(node){if(typeof node==='string'||typeof node==='number')return String(node);return React.Children.toArray(node?.props?.children).map(text).join('');}
  return {calls,intervals,listeners,doc,render,button,forms:manage=>elements(render(manage)).filter(e=>e.type==='form'),html:manage=>renderToStaticMarkup(render(manage)),set:v=>{current=structuredClone(v);},fail:v=>{fail=v;},mutationError:v=>{mutationError=v;},poll:async()=>{[...intervals.values()][0]();await flush();},cleanup:()=>cleanup.forEach(fn=>fn?.())};
}
const h=harness(); await flush();
assert(h.html().includes('Meet Amina'));assert(h.html().includes('Accept introduction'));
h.button('Accept introduction').props.onClick();h.button('Accept introduction').props.onClick();await flush();
assert.equal(h.calls.filter(x=>x.name==='answer_event_networking').length,1,'double click produces one write');
assert.deepEqual(h.calls.find(x=>x.name==='answer_event_networking').args,{p_event_id:'event',p_match_id:'match-1',p_accept:true});
h.mutationError(true);h.button('Skip').props.onClick();await flush();assert(!h.button('Skip').props.disabled,'write rejection releases busy state');
h.fail(true);await h.poll();assert(h.html().includes('Reconnecting'));assert(!h.html().includes('Meet Amina'),'failed read hides stale match');
h.fail(false);await h.poll();assert(h.html().includes('Meet Amina'),'successful poll recovers');
const before=h.calls.length;h.doc.hidden=true;await h.poll();assert.equal(h.calls.length,before,'hidden app does not heartbeat');h.doc.hidden=false;
h.set({...base,match:null});await h.poll();assert(h.html().includes('That introduction has ended'),'partner loss has discreet feedback');
h.cleanup();assert.equal(h.intervals.size,0);assert.equal(h.listeners.size,0);
const host=harness({...base,can_manage:true,is_admin:true,match:null,people:[{name:'Amina',ready:true,paired:true}],help:[{id:'help',name:'Amina',note:'Help finding the table'}]});await flush();
assert(host.html(true).includes('Disable networking'));assert(host.html(true).includes('Mark handled'));assert(!host.html(true).includes('Accept introduction'));
host.button('Pause',true).props.onClick();await flush();assert.equal(host.calls.find(x=>x.name==='control_event_networking').args.p_action,'pause');host.cleanup();
const scheduling=harness({...base,can_manage:true,match:null,session:{...base.session,status:'scheduled'}});await flush();
scheduling.button('Edit schedule',true).props.onClick();scheduling.forms(true)[0].props.onSubmit({preventDefault(){}});await flush();
const saved=scheduling.calls.find(x=>x.name==='save_event_networking');assert.equal(saved.args.p_starts_at,base.session.starts_at.replace('00Z','00.000Z'));assert.deepEqual(saved.args.p_points,['Table 1']);assert.equal(saved.args.p_minutes,5);scheduling.cleanup();
const notChecked=harness({...base,eligible:false,joined:false,match:null});await flush();assert(notChecked.html().includes('checked at the door'));assert(!notChecked.button('Join networking'));notChecked.cleanup();
const unjoined=harness({...base,joined:false,match:null});await flush();assert(unjoined.button('Join networking'));unjoined.cleanup();
const invitation=harness({...base,joined:false,match:null});await flush();
assert(invitation.html().includes('Networking is starting'));assert(invitation.html().includes('30:00'));
assert(invitation.html().includes('You’re checked in'));assert(invitation.button('Not now'));
assert(!invitation.html().includes('class="radar"'),'never animate a search before opt-in');
invitation.button('Not now').props.onClick();assert(!invitation.button('Not now'));assert(invitation.button('Join networking'));
assert(invitation.html().includes('Join whenever you’re ready.'));
await invitation.poll();assert(!invitation.button('Not now'),'polling must not undo dismissal');
assert.equal(invitation.calls.filter(x=>x.name!=='get_event_networking').length,0,'dismissal does not change a booking or participation');
invitation.button('Join networking').props.onClick();assert(invitation.html().includes('A short introduction'));assert(invitation.button('Not now'));
assert.equal(invitation.calls.filter(x=>x.name!=='get_event_networking').length,0,'opening the form is not enrolment');
invitation.button('Not now').props.onClick();assert(!invitation.html().includes('<form'));
invitation.button('Join networking').props.onClick();invitation.set({...base,match:null});
invitation.forms()[0].props.onSubmit({preventDefault(){}});await flush();
assert.deepEqual(invitation.calls.find(x=>x.name==='join_event_networking').args,{p_event_id:'event',p_join:true,p_introduction:base.introduction});
assert(invitation.html().includes('class="radar"'),'search begins only after server confirms participation');
invitation.set({...base,joined:false,match:null});invitation.button('Leave networking').props.onClick();await flush();
assert(invitation.html().includes('Join whenever you’re ready.'));assert(!invitation.html().includes('<form'),'leaving must not reopen the entry form');
invitation.cleanup();
for(const extra of [{eligible:false},{session:{...base.session,status:'paused'}},{session:{...base.session,disabled:true}},{session:{...base.session,status:'finished'}}]){
  const unavailable=harness({...base,joined:false,match:null,...extra});await flush();
  assert(!unavailable.html().includes('class="invitation"'),'unavailable session never invites a guest');assert(!unavailable.button('Not now'));unavailable.cleanup();
}
const lateInvitation=harness({...base,joined:false,match:null,session:{...base.session,round_no:3}});await flush();assert(lateInvitation.html().includes('Networking is live'));lateInvitation.fail(true);await lateInvitation.poll();assert(!lateInvitation.html().includes('class="invitation"'),'failed eligibility refresh hides live invitation');lateInvitation.cleanup();
const radar=harness({...base,match:null});await flush();assert(radar.html().includes('class="radar"'));assert(radar.html().includes('Finding your next introduction'));radar.button('Pause animation').props.onClick();assert(radar.html().includes('radarPaused'));assert(radar.button('Resume animation'));assert.equal(radar.calls.filter(x=>x.name!=='get_event_networking').length,0,'pausing animation does not leave or pause the session');radar.cleanup();
const scheduled=harness({...base,joined:false,match:null,session:{...base.session,status:'scheduled',starts_at:'2030-01-01T15:12:46Z'}});await flush();assert(scheduled.html().includes('12:46'));assert(!scheduled.html().includes('<form'));scheduled.button('Join networking').props.onClick();assert(scheduled.html().includes('<form'));scheduled.cleanup();
const waitingHost=harness({...base,joined:false,match:null,session:{...base.session,status:'scheduled'}});await flush();assert(waitingHost.html().includes('Waiting for the Host to begin'));assert(!waitingHost.html().includes('class="radar"'));waitingHost.cleanup();
const completed=harness({...base,match:null,session:{...base.session,status:'finished'},met:[{match_id:'old',name:'Zuri'}]});await flush();assert(completed.html().includes('class="roster" open=""'));assert(completed.html().includes('14 days'));assert(completed.html().includes('/network?view=connections'));completed.cleanup();
const endedState={...base,joined:false,match:null,end_notice:{id:'match-1',at:base.server_now,conversation:true}};
const ended=harness(endedState);await flush();
assert(ended.html().includes('This conversation has ended'),'refresh loads durable ending state');
assert(!ended.html().includes('Conversation time remaining'));assert(!ended.html().includes('class="radar"'));
assert(!ended.button('Join networking'));assert(ended.button('Find someone else'));assert(ended.button('Leave networking'));
ended.mutationError(true);ended.button('Find someone else').props.onClick();await flush();
assert(ended.html().includes('This conversation has ended'),'failed continuation keeps choice visible');
assert(!ended.button('Find someone else').props.disabled,'failed continuation releases action lock');
ended.mutationError(false);ended.set({...base,match:null});
ended.button('Find someone else').props.onClick();ended.button('Find someone else').props.onClick();await flush();
assert.equal(ended.calls.filter(x=>x.name==='continue_event_networking').length,2,'one failed attempt and one successful write, not a duplicate click');
assert.deepEqual(ended.calls.find(x=>x.name==='continue_event_networking').args,{p_event_id:'event',p_notice_id:'match-1'});
assert(ended.html().includes('Finding your next introduction'));assert(!ended.html().includes('This conversation has ended'));ended.cleanup();
const early=harness({...base,match:{...base.match,status:'active'}});await flush();
assert(early.button('End conversation'));early.set(endedState);early.button('End conversation').props.onClick();await flush();
assert.deepEqual(early.calls.find(x=>x.name==='answer_event_networking').args,{p_event_id:'event',p_match_id:'match-1',p_accept:false});
assert(early.html().includes('This conversation has ended'));assert(!early.html().includes('Meet Amina'));early.cleanup();
const peer=harness({...base,match:{...base.match,status:'active'}});await flush();peer.set(endedState);await peer.poll();
assert(peer.html().includes('This conversation has ended'));assert(!peer.html().includes('We will look for someone else'));
assert.equal(peer.calls.filter(x=>x.name!=='get_event_networking').length,0,'peer notification never auto-acknowledges');
peer.set({...endedState,session:{...base.session,status:'paused'}});await peer.poll();assert(!peer.button('Find someone else'),'Host pause prevents continuation');
peer.set({...endedState,eligible:false});await peer.poll();assert(!peer.button('Find someone else'),'revoked guest cannot continue');peer.cleanup();

const sql=read('supabase/migrations/20261025060849_event_networking_pairs.sql');
for(const guard of ['for update','unique(event_id,member_a,member_b)',"m.status='attended'",'public.is_blocked_pair','accepted_a and accepted_b',"interval '60 seconds'",'revoke all on schema hat_networking','revoke all on all functions in schema hat_networking','request_connection_with_context']) assert(sql.includes(guard),guard);
assert(!sql.includes('grant select'),'private networking tables must not gain direct client reads');
assert(read('app/events/[slug]/page.tsx').includes('<EventNetworking'));
assert(read('app/events/[slug]/host/page.tsx').includes('<EventNetworking'));
assert(read('components/admin/event-command-centre.tsx').includes('<EventNetworkingControl'));
if(process.argv.includes('--preview')) {
  const p=harness({...base,match:{...base.match,status:'active'},met:[{match_id:'old',name:'Zuri'}]});await flush();
  const target=new URL('tmp/networking-preview/',root);mkdirSync(target,{recursive:true});
  const css=read('components/events/event-networking.module.css')+'\nbody{margin:0;background:#f6f4ed;font-family:Arial,sans-serif;padding:24px;color:#263a31}main{max-width:900px;margin:auto}button{font:inherit;border:1px solid #bfcfc3;border-radius:8px;padding:10px 16px;background:white;color:#215846;cursor:pointer}.button-primary{background:#215846;color:white}h1{font-size:28px}';
  writeFileSync(new URL('index.html',target),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Networking preview — example data</title><style>${css}</style></head><body><main><p>DESIGN CHECK · EXAMPLE PEOPLE · NO LIVE ACTIONS</p>${p.html()}</main></body></html>`);p.cleanup();
  for(const [name,extra] of [['invitation',{joined:false,match:null}],['ended',endedState],['radar',{match:null}],['strip',{joined:false,match:null,session:{...base.session,status:'scheduled',starts_at:'2030-01-01T15:12:46Z'}}]]){
    const sample=harness({...base,...extra});await flush();writeFileSync(new URL(`${name}.html`,target),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Networking ${name} — example data</title><style>${css}</style></head><body><main><p>DESIGN CHECK · EXAMPLE DATA · NO LIVE ACTIONS</p>${sample.html()}</main></body></html>`);sample.cleanup();
  }
}
console.log('PASS: networking clock/phase boundaries, actual component rendering, double-submit lock, rejected-write recovery, stale-read hiding, reconnect, background pause, Host controls, eligibility guidance and scoped wiring. Multi-device L3 remains separate.');
