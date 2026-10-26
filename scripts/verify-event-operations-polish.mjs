import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {attendanceCsv} from '../lib/events/attendance-export.ts';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const compile=s=>ts.transpileModule(s.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
const styles=new Proxy({},{get:(_,k)=>String(k)}),flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const text=n=>typeof n==='string'||typeof n==='number'?String(n):React.Children.toArray(n?.props?.children).map(text).join('');
const elements=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(elements)];
const props={eventId:'event-a',title:'Founders’ Evening',startsAt:'2030-01-01T15:00:00Z',venue:'Nairobi',timeZone:'Africa/Nairobi'};
function scanner({initial=null,native=true,pending=false,outcome='checked_in',qrValue=null}={}){
  let cursor=0,values=[],effects=[],release,stopped=0,focused=0,mediaCalls=0;
  const calls=[],listeners=new Map(),document={hidden:false,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
  const stream={getTracks:()=>[{stop(){stopped++;}}]},video={srcObject:null,play:async()=>{}},manual={focus(){focused++;}};
  const supabase={rpc:async(name,args)=>{calls.push({name,args});return {data:[{outcome,message:'Example pass response',attendee_name:'Amina N.',checked_in_at:'2030-01-01T15:02:00Z'}],error:null};}};
  const useState=v=>{const i=cursor++;if(!(i in values))values[i]=i===2?initial:v;return [values[i],x=>values[i]=typeof x==='function'?x(values[i]):x];};
  const useRef=v=>{const i=cursor++;return values[i]??={current:v};};
  const deps={React,useState,useRef,useMemo:f=>f(),useEffect:f=>effects.push(f),createClient:()=>supabase,memberErrorMessage:()=> 'Please try again.',styles,document,
    navigator:{mediaDevices:{getUserMedia:()=>{mediaCalls++;return pending?new Promise(r=>release=r):Promise.resolve(stream);}}},
    window:{BarcodeDetector:native?class{async detect(){return qrValue?[{rawValue:qrValue}]:[];}}:undefined,requestAnimationFrame(){},addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)}};
  const Component=new Function(...Object.keys(deps),`${compile(read('components/events/event-door-console.tsx'))};return EventDoorConsole;`)(...Object.values(deps));
  const render=()=>{cursor=0;effects=[];const tree=Component(props);for(const n of elements(tree)){if(n.type==='video')n.props.ref.current=video;if(n.type==='input')n.props.ref.current=manual;}return tree;};
  render();const cleanup=effects.map(f=>f());
  return {calls,document,listeners,html:()=>renderToStaticMarkup(render()),tree:render,button:label=>elements(render()).find(n=>n.type==='button'&&text(n)===label),input:()=>elements(render()).find(n=>n.type==='input'),form:()=>elements(render()).find(n=>n.type==='form'),release:()=>release(stream),mediaCalls:()=>mediaCalls,stopped:()=>stopped,focused:()=>focused,cleanup:()=>cleanup.forEach(f=>f?.())};
}
const pending=scanner({pending:true});const startClick=pending.button('Scan QR pass').props.onClick;startClick();startClick();assert.equal(pending.mediaCalls(),1,'one camera permission request');pending.document.hidden=true;pending.listeners.get('visibilitychange')();pending.release();await flush();assert.equal(pending.stopped(),1,'late permission grant closes its stream after app hides');assert(!pending.button('Stop camera'));pending.cleanup();
const camera=scanner();camera.button('Scan QR pass').props.onClick();await flush();assert(camera.button('Stop camera'));camera.button('Stop camera').props.onClick();assert.equal(camera.stopped(),1);camera.cleanup();
const qr=scanner({qrValue:'HATCHECKIN:event-a:example-token'});qr.button('Scan QR pass').props.onClick();await flush();assert.equal(qr.calls.length,1);assert.equal(qr.calls[0].args.p_method,'qr');assert.equal(qr.calls[0].args.p_event_id,'event-a');assert.equal(qr.stopped(),1);assert(qr.button('Scan next guest'));qr.cleanup();
const fallback=scanner({native:false});fallback.button('Scan QR pass').props.onClick();await flush();assert(fallback.html().includes('manual code'));assert.equal(fallback.focused(),1);fallback.cleanup();
for(const [outcome,label] of [['checked_in','Guest checked in'],['already_checked_in','Already checked in'],['error','Check-in not confirmed'],['not_found','Pass not accepted']]){
  const h=scanner({outcome});h.input().props.onChange({target:{value:'ab cd123456'}});h.form().props.onSubmit({preventDefault(){}});await flush();assert(h.html().includes(label));assert.equal(h.calls[0].args.p_event_id,'event-a');assert.equal(h.calls[0].args.p_credential,'ABCD123456');assert(h.button('Next guest'));h.button('Next guest').props.onClick();assert(!h.html().includes(label));h.cleanup();
}
const exportData={title:'=HYPERLINK("bad")',timezone:'Africa/Nairobi',generated_at:'2030-01-01T15:00:00Z',guests:[{name:'Amina, "N."',arrived:true,checked_in_at:'2030-01-01T15:02:00Z',checked_in_by:'@staff',method:'qr'}]};
const csv=attendanceCsv(exportData);assert(csv.startsWith('\uFEFF'));assert(csv.includes('"\'=HYPERLINK(""bad"")"'));assert(csv.includes('"Amina, ""N."""'));assert(csv.includes('"\'@staff"'));assert(csv.includes('18:02:00'));assert(!csv.includes('manual_code'));
let user={id:'host'},response={data:exportData,error:null};
const route=new Function('createClient','attendanceCsv',`${compile(read('app/events/[slug]/attendance.csv/route.ts'))};return GET;`)(async()=>({auth:{getUser:async()=>({data:{user}})},rpc:async()=>response}),attendanceCsv);
const request=()=>route(new Request('https://example.invalid/events/event/attendance.csv'),{params:Promise.resolve({slug:'event'})});
let result=await request();assert.equal(result.status,200);assert(result.headers.get('cache-control').includes('no-store'));assert(result.headers.get('content-disposition').includes('attachment'));assert((await result.text()).includes('Amina'));
user=null;result=await request();assert.equal(result.status,401);user={id:'helper'};response={data:null,error:{code:'P0001',message:'Private DB detail'}};result=await request();assert.equal(result.status,403);assert(!(await result.text()).includes('Private DB detail'));response={data:null,error:{code:'503',message:'Offline'}};result=await request();assert.equal(result.status,503);
const updatesData={server_now:'2030-01-01T15:00:00Z',live:[{event_id:'a',slug:'founders-evening',title:'Founders’ Evening',ends_at:'2030-01-01T15:30:00Z',timezone:'Africa/Nairobi'}],recent:[{event_id:'b',slug:'recent-evening',title:'An earlier evening',ends_at:'2030-01-01T14:00:00Z',timezone:'Africa/Nairobi',people_met:3}]};
const viewDeps={React,styles};
const view=new Function(...Object.keys(viewDeps),`${compile(read('components/events/networking-updates.tsx'))};return NetworkingUpdatesView;`)(...Object.values(viewDeps));
const updatesHtml=(dismissed=[],showRecent=true)=>renderToStaticMarkup(React.createElement(view,{data:updatesData,dismissed,onDismiss(){},showRecent}));
assert(updatesHtml().includes('Networking is live'));assert(updatesHtml().includes('18:30'));assert(updatesHtml().includes('3 people'));assert(!updatesHtml(['a:2030-01-01T15:30:00Z']).includes('Networking is live'));assert(!updatesHtml([],false).includes('An earlier evening'));
assert(updatesHtml().includes('/events/founders-evening#event-networking'));
// Exercise actual reminder polling: no background heartbeat or automatic join.
let cursor=0,values=[],effects=[],fail=false;const calls=[],intervals=[],listeners=new Map(),doc={hidden:false,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
const deps={React,styles,NetworkingUpdatesView:view,usePathname:()=>'/home',createClient:()=>({rpc:async name=>{calls.push(name);if(fail)throw Error('offline');return {data:updatesData,error:null};}}),useMemo:f=>f(),useCallback:f=>f,useState:v=>{const i=cursor++;if(!(i in values))values[i]=v;return [values[i],n=>values[i]=typeof n==='function'?n(values[i]):n];},useRef:v=>{const i=cursor++;return values[i]??={current:v};},useEffect:f=>effects.push(f),setInterval:f=>{intervals.push(f);return intervals.length;},clearInterval(){},document:doc,window:{addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)}};
// View declaration is in the same module, so don't inject an identically named binding.
delete deps.NetworkingUpdatesView;
const Updates=new Function(...Object.keys(deps),`${compile(read('components/events/networking-updates.tsx'))};return NetworkingUpdates;`)(...Object.values(deps));
const renderUpdates=()=>{cursor=0;effects=[];return Updates();};renderUpdates();const cleanup=effects.map(f=>f());await flush();assert(renderUpdates());doc.hidden=true;const before=calls.length;intervals[0]();await flush();assert.equal(calls.length,before);doc.hidden=false;fail=true;intervals[0]();await flush();assert.equal(renderUpdates(),null,'failed reminder read hides stale invitation');assert(calls.every(n=>n==='get_my_networking_updates'));cleanup.forEach(f=>f?.());assert.equal(listeners.size,0);
if(process.argv.includes('--preview')){
  const target=new URL('tmp/networking-preview/',root);mkdirSync(target,{recursive:true});
  const base='body{margin:0;padding:24px;background:#f7f5ee;color:#263f32;font:15px Arial,sans-serif}main{max-width:880px;margin:auto}.button{display:inline-flex;align-items:center;justify-content:center;border:1px solid #bfccb5;background:white;color:#215846;border-radius:8px;padding:12px 18px;font:inherit;box-sizing:border-box}.button-primary{background:#215846;color:white}';
  const write=(name,css,body)=>writeFileSync(new URL(name,target),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${base}${css}</style><title>Event tools — example data</title></head><body><main><p>DESIGN CHECK · EXAMPLE DATA · NO LIVE ACTIONS</p>${body}</main></body></html>`);
  const sample=scanner({initial:{outcome:'checked_in',message:'This guest’s arrival is saved.',attendee_name:'Amina N.',checked_in_at:'2030-01-01T15:02:00Z'}});write('scanner.html',read('components/events/event-door-console.module.css'),sample.html());sample.cleanup();
  write('networking-updates.html',read('components/events/networking-updates.module.css'),updatesHtml());
}
console.log('PASS: actual scanner states, camera request race/hide cleanup, manual fallback, safe CSV/route auth, networking reminder rendering and read-only foreground polling. Physical camera and inbox acceptance remain open.');
