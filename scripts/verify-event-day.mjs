import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const compile=s=>ts.transpileModule(s.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const text=n=>typeof n==='string'||typeof n==='number'?String(n):React.Children.toArray(n?.props?.children).map(text).join('');
const elements=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(elements)];
const styles=new Proxy({},{get:(_,k)=>String(k)});
function runtime(path,name,extras){
  let cursor=0,values=[],effects=[],queued=[];
  const deps={React,styles,useState:v=>{const i=cursor++;if(!(i in values))values[i]=typeof v==='function'?v():v;return [values[i],v=>values[i]=typeof v==='function'?v(values[i]):v];},
    useRef:v=>{const i=cursor++;return values[i]??={current:v};},useMemo:f=>{const i=cursor++;return values[i]??=f();},
    useEffect:(fn,keys)=>{const i=cursor++,old=effects[i];if(!old||keys.some((v,j)=>v!==old.keys[j])){queued.push(()=>{old?.cleanup?.();effects[i]={keys,cleanup:fn()};});}},...extras};
  const Component=new Function(...Object.keys(deps),`${compile(read(path))};return ${name};`)(...Object.values(deps));
  return {render(...args){cursor=0;queued=[];const result=Component(...args);queued.forEach(f=>f());return result;},cleanup(){effects.forEach(e=>e?.cleanup?.());}};
}
// Execute the actual polling hook with controlled network, clock and visibility.
let fail=false,hold=false,online=true,now=100,release;
const calls=[],intervals=new Map(),timeouts=new Map(),listeners=new Map();let timer=0;
const document={hidden:false,addEventListener:(k,f)=>listeners.set('doc:'+k,f),removeEventListener:k=>listeners.delete('doc:'+k)};
const window={addEventListener:(k,f)=>listeners.set('win:'+k,f),removeEventListener:k=>listeners.delete('win:'+k)};
const client={rpc:(name,args)=>({abortSignal:signal=>{calls.push({name,args,signal});if(hold)return new Promise(resolve=>release=()=>resolve({data:{value:'old'},error:null}));return Promise.resolve(fail?{data:null,error:{code:'offline'}}:{data:{value:args.id},error:null});}})};
const hook=runtime('components/events/use-event-live-read.ts','useEventLiveRead',{createClient:()=>client,document,window,navigator:{get onLine(){return online;}},performance:{now:()=>now},AbortController,
  setInterval:(f,ms)=>{intervals.set(++timer,{f,ms});return timer;},clearInterval:id=>intervals.delete(id),setTimeout:f=>{timeouts.set(++timer,f);return timer;},clearTimeout:id=>timeouts.delete(id)});
const poll=()=>[...intervals.values()].find(x=>x.ms===10000).f();
let live=()=>hook.render('read',{id:'a'});
assert.equal(live().data,null);await flush();assert.equal(live().data.value,'a');
document.hidden=true;const count=calls.length;poll();await flush();assert.equal(calls.length,count,'no hidden polling');document.hidden=false;
online=false;listeners.get('win:offline')();assert.equal(live().data,null,'offline hides stale counts');assert(live().error.includes('offline'));
online=true;listeners.get('win:online')();await flush();assert.equal(live().data.value,'a');
fail=true;poll();await flush();assert.equal(live().data,null,'failed read is not zero');fail=false;poll();await flush();assert.equal(live().data.value,'a');
now+=46000;[...intervals.values()].find(x=>x.ms===1000).f();assert.equal(live().data,null,'stale snapshot hidden after 45 seconds');
hold=true;poll();const pendingCalls=calls.length;poll();assert.equal(calls.length,pendingCalls,'no overlapping poll');
const oldRelease=release;hold=false;live=()=>hook.render('read',{id:'b'});live();await flush();assert.equal(live().data.value,'b');oldRelease();await flush();assert.equal(live().data.value,'b','old query cannot replace new query');
live().refresh();live();await flush();assert.equal(live().data.value,'b');
hook.cleanup();assert.equal(intervals.size,0);assert.equal(listeners.size,0);assert.equal(timeouts.size,0);

const snapshot={server_now:'2030-01-01T15:00:00Z',confirmed:70,checked_in:50,not_checked_in:20,running_late:3,not_attending:2,total:70,offset:0,
  guests:[{user_id:'a',name:'Amina N.',checked_in_at:'2030-01-01T15:02:00Z',checked_in_by_name:'Lex',plan:'as_planned',note:null,updated_at:null},
    {user_id:'b',name:'Neema',checked_in_at:null,plan:'running_late',note:'Arriving at 7 <script>alert(1)</script>',updated_at:'2030-01-01T15:03:00Z'}],
  networking:{status:'running',disabled:false,starts_at:'2030-01-01T15:00:00Z',ends_at:'2030-01-01T15:30:00Z',round_no:2,counts:{talking:12,offered:4,waiting:3,away:1}}};
let response={data:snapshot,error:'',age:3,refresh(){}},lastArgs;
const day=runtime('components/events/event-day-overview.tsx','EventDayOverview',{useEventLiveRead:(name,args)=>{lastArgs={name,args};return response;}});
const props={eventId:'event-a',slug:'founders-evening',title:'Founders’ Evening',timeZone:'Africa/Nairobi'};
const tree=()=>day.render(props),html=()=>renderToStaticMarkup(tree()),button=label=>elements(tree()).find(n=>n.type==='button'&&text(n)===label);
assert(html().includes('50'));assert(html().includes('Not checked in'));assert(html().includes('Awaiting acceptance'));assert(html().includes('Updated 3 seconds ago'));
assert(html().includes('/events/founders-evening/door'));assert(html().includes('#host-guests'));assert(html().includes('Private guest note'));assert(!html().includes('<script>'),'notes are escaped');
button('3 running late').props.onClick();tree();assert.equal(lastArgs.args.p_filter,'running_late');button('Next').props.onClick();tree();assert.equal(lastArgs.args.p_offset,25);
elements(tree()).find(n=>n.type==='input').props.onChange({target:{value:'Neema'}});tree();assert.equal(lastArgs.args.p_offset,0);assert.equal(lastArgs.args.p_search,'Neema');
response={...response,data:null,error:'Connection failed'};assert(!html().includes('<dd>50</dd>'));assert(!html().includes('<dd>0</dd>'));assert(html().includes('No figures are shown'));assert(html().includes('value="Neema"'),'search remains usable during refresh');
response={...response,data:{...snapshot,networking:{...snapshot.networking,counts:null,status:'paused'}},error:''};assert(html().includes('Paused'));assert(!html().includes('In conversations'));
day.cleanup();

let plan={status:'as_planned',note:'',can_edit:true},writeFail=false,writing=false,releaseWrite,refreshes=0;const writes=[];
const planView=runtime('components/events/event-attendance-plan.tsx','EventAttendancePlan',{createClient:()=>({rpc:async(name,args)=>{writes.push({name,args});if(writing)await new Promise(r=>releaseWrite=r);return {data:plan,error:writeFail?{code:'failed'}:null};}}),useEventLiveRead:()=>({data:plan,error:'',refresh(){refreshes++;}})});
const planTree=()=>planView.render({eventId:'event-a'}),planHtml=()=>renderToStaticMarkup(planTree()),planButton=label=>elements(planTree()).find(n=>n.type==='button'&&text(n)===label);
planButton('I’m running late').props.onClick();elements(planTree()).find(n=>n.type==='textarea').props.onChange({target:{value:'At 7 pm'}});
writing=true;const submit=elements(planTree()).find(n=>n.type==='form').props.onSubmit;submit({preventDefault(){}});submit({preventDefault(){}});assert.equal(writes.length,1);assert.equal(writes[0].args.p_note,'At 7 pm');writing=false;releaseWrite();await flush();assert(planHtml().includes('booking and ticket have not changed'));assert.equal(refreshes,1);
planButton('I can’t attend').props.onClick();elements(planTree()).find(n=>n.type==='textarea').props.onChange({target:{value:'Please keep this note'}});writeFail=true;elements(planTree()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await flush();assert(planHtml().includes('could not be confirmed'));assert(planHtml().includes('Please keep this note'));
plan={...plan,can_edit:false};assert(!planButton('I can’t attend'));assert(planHtml().includes('arrival is already recorded'));planView.cleanup();

if(process.argv.includes('--preview')){
  response={data:snapshot,error:'',age:3,refresh(){}};plan={status:'as_planned',note:'',can_edit:true};
  const dir=new URL('tmp/event-day-preview/',root);mkdirSync(dir,{recursive:true});
  const base='*{box-sizing:border-box}body{margin:0;padding:32px;background:#f7f5ee;color:#263c31;font:16px Arial,sans-serif}main{max-width:1000px;margin:auto;background:#fffefa;padding:28px;border-radius:12px}.button{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;min-height:44px;border:1px solid #c7d2bf;border-radius:8px;padding:10px 16px;color:#215846}.button-primary{background:#215846;color:white}';
  const cleanSnapshot={...snapshot,guests:snapshot.guests.map(g=>({...g,note:g.note?'I expect to arrive at 7 pm.':null}))};
  const cleanDay=runtime('components/events/event-day-overview.tsx','EventDayOverview',{useEventLiveRead:()=>({...response,data:cleanSnapshot})});
  const cleanPlan=runtime('components/events/event-attendance-plan.tsx','EventAttendancePlan',{createClient:()=>client,useEventLiveRead:()=>({data:plan,error:'',refresh(){}})});
  writeFileSync(new URL('index.html',dir),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Event day · Example data</title><style>${base}${read('components/events/event-day.module.css')}</style></head><body><main><p>DESIGN CHECK · EXAMPLE DATA · NO LIVE ACTIONS</p>${renderToStaticMarkup(cleanDay.render(props))}${renderToStaticMarkup(cleanPlan.render({eventId:'event-a'}))}</main></body></html>`);
}
console.log('PASS: actual Event day/attendance components and polling hook: private notes, labels, paging/search, no failed-read zeros, offline/stale recovery, request races, visibility cleanup, duplicate-write lock and saved-draft recovery.');
