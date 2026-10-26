import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const root=new URL('../',import.meta.url), read=p=>readFileSync(new URL(p,root),'utf8');
const compile=s=>ts.transpileModule(s.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
const source=compile(read('components/events/event-host-arrival.tsx'));
const fixture={expected:31,arrived:12,total:31,offset:0,guests:[{user_id:'a',name:'Amina N.',checked_in_at:'2030-01-01T15:32:00Z',checked_in_by_name:'Lex Sam',method:'qr'},{user_id:'b',name:'Wanjiku M.',checked_in_at:null}],helpers:[{name:'Lex Sam',email:'helper@example.invalid',active:true}],activity:[{operator_id:'lex',name:'Lex Sam',checked_in:12,qr:10,manual:2,reversed:1,first_check_in:'2030-01-01T15:02:00Z',last_check_in:'2030-01-01T15:32:00Z'}]};
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
function harness(){
  let current=structuredClone(fixture),readFail=false,writeFail=false,cursor=0,values=[],effects=[];
  const calls=[],intervals=new Map(),document={hidden:false};
  const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='get_my_event_arrival'){if(readFail)throw Error('offline');return {data:current,error:null};}if(writeFail)throw Error('write failed');return {data:null,error:null};}};
  const useState=initial=>{let i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>values[i]=typeof v==='function'?v(values[i]):v];};
  const useRef=initial=>{let i=cursor++;return values[i]??={current:initial};};
  const clipboard={text:null,fail:false,async writeText(v){if(this.fail)throw Error('denied');this.text=v;}};
  const deps={React,useState,useRef,useMemo:f=>f(),useCallback:f=>f,useEffect:f=>effects.push(f),createClient:()=>client,useActionDialog:()=>({ask:async()=>({}),dialog:null}),memberErrorMessage:()=> 'Please try again.',styles:new Proxy({},{get:(_,k)=>String(k)}),document,navigator:{clipboard},setInterval:f=>{intervals.set(intervals.size+1,f);return intervals.size;},clearInterval:id=>intervals.delete(id)};
  const Component=new Function(...Object.keys(deps),`${source};return EventHostArrival;`)(...Object.values(deps));
  function render(){cursor=0;effects=[];return Component({eventId:'event-a',slug:'founders-evening',title:'Founders’ Evening',timeZone:'Africa/Nairobi',upcoming:true});}
  render();const cleanup=effects.map(f=>f());
  const elements=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(elements)];
  const text=n=>typeof n==='string'||typeof n==='number'?String(n):React.Children.toArray(n?.props?.children).map(text).join('');
  return {calls,document,clipboard,tree:render,html:()=>renderToStaticMarkup(render()),button:label=>elements(render()).find(n=>n.type==='button'&&text(n)===label),inputs:()=>elements(render()).filter(n=>n.type==='input'),forms:()=>elements(render()).filter(n=>n.type==='form'),set:v=>{current=structuredClone(v);},readFail:v=>readFail=v,writeFail:v=>writeFail=v,poll:async()=>{[...intervals.values()][0]();await flush();},cleanup:()=>cleanup.forEach(f=>f?.())};
}
const h=harness();await flush();assert(h.html().includes('Amina N.'));assert(h.html().includes('18:32'));assert(h.html().includes('/events/founders-evening/door'));
h.inputs().find(n=>n.props.type==='email').props.onChange({target:{value:'helper@example.invalid'}});h.forms()[0].props.onSubmit({preventDefault(){}});h.forms()[0].props.onSubmit({preventDefault(){}});await flush();
assert.equal(h.calls.filter(x=>x.name==='manage_my_event_door_helper').length,1,'double click adds one helper');
assert.deepEqual(h.calls.find(x=>x.name==='manage_my_event_door_helper').args,{p_event_id:'event-a',p_email:'helper@example.invalid',p_action:'assign'});
assert(h.html().includes('Checked in by Lex Sam'));assert(h.html().includes('12 checked in'));assert(h.html().includes('10 QR scans'));assert(h.html().includes('1 undone'));assert(h.html().includes('No Admin approval needed'));
await h.button('Copy link').props.onClick();await flush();assert.equal(h.clipboard.text,'https://www.herafricatable.com/events/founders-evening/door');assert(h.html().includes('link copied'));
h.clipboard.fail=true;await h.button('Copy link').props.onClick();await flush();assert(h.html().includes('Couldn’t copy'));
h.writeFail(true);h.button('Remove').props.onClick();await flush();assert(!h.button('Remove').props.disabled,'failed removal releases lock');assert(h.html().includes('Lex Sam'));
h.readFail(true);await h.poll();assert(!h.html().includes('Amina N.'),'failed read hides stale attendance');assert(h.html().includes('couldn’t load'));h.readFail(false);await h.poll();assert(h.html().includes('Amina N.'));
h.button('Arrived').props.onClick();await flush();assert.equal(h.calls.at(-1).args.p_filter,'arrived');
h.set({...fixture,offset:25});h.button('Next').props.onClick();await flush();assert.equal(h.calls.at(-1).args.p_offset,25);
h.inputs().find(n=>n.props.placeholder==='Guest’s name').props.onChange({target:{value:'Amina'}});h.forms()[1].props.onSubmit({preventDefault(){}});await flush();assert.equal(h.calls.at(-1).args.p_search,'Amina');h.button('Clear search').props.onClick();await flush();assert.equal(h.calls.at(-1).args.p_search,'');
const before=h.calls.length;h.document.hidden=true;await h.poll();assert.equal(h.calls.length,before,'hidden page does not poll');h.document.hidden=false;
const Schedule=new Function('React','styles',`${compile(read('components/events/event-networking-schedule.tsx'))};return NetworkingSchedule;`)(React,{});
const scheduleHtml=renderToStaticMarkup(React.createElement(Schedule,{schedule:{starts_at:'2030-01-01T15:30:00Z',ends_at:'2030-01-01T16:00:00Z',minutes:5,status:'scheduled',disabled:false},timeZone:'Africa/Nairobi'}));
assert(scheduleHtml.includes('18:30'));assert(scheduleHtml.includes('19:00'));assert(scheduleHtml.includes('Check in when you arrive'));assert(!scheduleHtml.includes('Table 1'));
assert(read('components/events/event-host-workspace.tsx').includes('primarySections.push(["networking", "Networking"])'));assert(read('components/events/event-host-workspace.tsx').includes('primarySections.push(["guests", "Guests & check-in"])'));
assert(read('app/events/[slug]/pass/page.tsx').includes('<NetworkingSchedule'));
const doorSource=read('components/events/event-door-console.tsx');
const checkSource=compile(doorSource.slice(doorSource.indexOf('  async function checkIn('),doorSource.indexOf('  async function startCamera(')));
for(const fail of [false,true]){
  const calls=[],states=[],results=[],busyRef={current:false};
  const context={busyRef,setBusy:v=>states.push(v),setResult:v=>results.push(v),setCode(){},eventId:'event-a',memberErrorMessage:()=> 'Try the same pass again.',supabase:{rpc:async(name,args)=>{calls.push({name,args});if(fail)throw Error('offline');return {data:[{outcome:'checked_in',message:'Checked in'}],error:null};}}};
  const check=new Function(...Object.keys(context),`${checkSource};return checkIn;`)(...Object.values(context));
  await Promise.all([check('PASS-TEST','manual'),check('PASS-TEST','manual')]);
  assert.equal(calls.length,1);assert.equal(calls[0].args.p_event_id,'event-a');assert.equal(busyRef.current,false);assert.equal(states.at(-1),false);
  assert.equal(results.at(-1).outcome,fail?'error':'checked_in');
}
if(process.argv.includes('--preview')){
  const preview=harness();await flush();preview.set({...fixture,guests:[...fixture.guests,...Array.from({length:23},(_,i)=>({user_id:`example-${i}`,name:`Example guest ${i+3}`,checked_in_at:i<11?'2030-01-01T15:35:00Z':null}))]});await preview.poll();
  const target=new URL('tmp/networking-preview/',root);mkdirSync(target,{recursive:true});
  const css=read('components/events/event-host-arrival.module.css')+'body{margin:0;padding:24px;background:#f7f5ee;font:15px Arial,sans-serif;color:#263f32}main{max-width:960px;margin:auto;background:#fffef8;padding:24px;border-radius:12px}button,a.button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font:inherit;padding:10px 15px;border:1px solid #c7d1c0;border-radius:8px;background:white;color:#264634;text-decoration:none}.button-primary{background:#215846!important;color:#fff!important}';
  writeFileSync(new URL('host-arrival.html',target),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><title>Host arrival — example data</title></head><body><p>DESIGN CHECK · EXAMPLE DATA · NO LIVE ACTIONS</p><main>${preview.html()}</main></body></html>`);
  const noop=()=>{},Link=({href,children})=>React.createElement('a',{href},children);
  const deps={React,Link,useEffect:noop,useMemo:f=>f(),useRef:v=>({current:v}),useState:v=>[v==='introduction'?'guests':v,noop],useRouter:()=>({refresh:noop}),createClient:()=>({}),useCommunityDraft:(key,value)=>[value,noop,noop,false],communityDraftKey:()=> 'example',useCommunityFileGuard:noop,useActionDialog:()=>({ask:noop,dialog:null}),useActionFeedback:()=>({feedback:null,setMessage:noop}),ActionFeedback:()=>null,EventHostPublicDetails:()=>null,EventImageDisplayOptions:()=>null,formatEventTimeInput:v=>v,parseEventTimeInput:v=>v};
  const Workspace=new Function(...Object.keys(deps),`${compile(read('components/events/event-host-workspace.tsx'))};return EventHostWorkspace;`)(...Object.values(deps));
  const workspace=Workspace({currentUserId:'host',initial:{event_id:'event-a',event_slug:'founders-evening',event_title:'Founders’ Evening',event_status:'published',starts_at:'2030-01-01T15:00:00Z',ends_at:'2030-01-01T18:00:00Z',timezone:'Africa/Nairobi',workspace_status:'approved',summary:'An evening for founders to meet and exchange ideas.',arrival_info:'Show your event pass at the welcome desk.',programme:[],partners:[],review_note:null},cover:null,coverReady:true,outcomes:null,communities:[],communityLinksReady:true,selfPublish:true,networking:React.createElement('p',null,'Networking setup example'),arrival:preview.tree()});
  const hostCss=read('app/event-host-workspace.css')+read('app/product-ui-foundation.css')+read('app/members-club.css')+css+'[hidden]{display:none!important}.event-host-page{max-width:1040px;margin:auto}.host-workspace{width:100%;min-width:0;box-sizing:border-box}.host-workspace-panel{box-sizing:border-box}';
  writeFileSync(new URL('host-workspace.html',target),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${hostCss}</style><title>Host workspace — example data</title></head><body class="hat-design-c"><p>DESIGN CHECK · EXAMPLE DATA · NO LIVE ACTIONS</p><main class="event-host-page">${renderToStaticMarkup(workspace)}</main></body></html>`);
  preview.cleanup();
}
h.cleanup();console.log('PASS: Host arrival actual-component tests, scoped helper writes, duplicate/failure recovery, stale-read hiding, filters/paging, quiet background refresh and schedule rendering. Physical scanner L3 remains separate.');
