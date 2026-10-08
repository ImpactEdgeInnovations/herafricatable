import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const read = file => readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const network = read('components/member/network-hub.tsx');
const gatherings = read('components/member/community-gatherings.tsx');
function action(source, name, next, context) {
  const body=source.slice(source.indexOf(`  async function ${name}(`),source.indexOf(next,source.indexOf(`  async function ${name}(`)));
  const code=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(context),`${code};return ${name};`)(...Object.values(context));
}
for (const outcome of ['success','denied','throw','empty']) {
  const busy=[], messages=[], pushes=[], calls=[];
  const rpc=async(name,args)=>{calls.push([name,args]);if(outcome==='throw')throw Error('Offline');return {data:outcome==='empty'?null:'conversation & one',error:outcome==='denied'?Error('Accepted connection required'):null};};
  await action(network,'startMessage','  async function planFollowup',{supabase:{rpc},setBusy:v=>busy.push(v),setMessage:v=>messages.push(v),memberErrorMessage:()=> 'Could not open',router:{push:v=>pushes.push(v)}})('connection-one');
  assert.deepEqual(calls,[['ensure_conversation',{p_connection_id:'connection-one'}]]);
  assert.equal(busy.at(-1),'');
  assert.deepEqual(pushes,outcome==='success'?['/messages?conversation=conversation%20%26%20one']:[]);
  if(outcome!=='success')assert.equal(messages.at(-1),'Could not open');
}
for (const outcome of ['success','denied','throw']) {
  const card={room_id:'room-one',my_rsvp:null,going_count:0};let items=[card];const busy=[],messages=[],calls=[];
  await action(gatherings,'rsvp','  function renderCard',{supabase:{rpc:async(name,args)=>{calls.push([name,args]);if(outcome==='throw')throw Error('Offline');return {error:outcome==='denied'?Error('Full'):null};}},setBusyId:v=>busy.push(v),setMessage:v=>messages.push(v),setItems:fn=>{items=fn(items);},memberErrorMessage:()=> 'Could not save'})(card);
  assert.equal(calls[0][0],'set_community_gathering_rsvp');assert.equal(calls[0][1].p_discoverable,false);
  assert.equal(busy.at(-1),null);
  assert.equal(items[0].my_rsvp,outcome==='success'?'going':null);
  assert.equal(messages.at(-1),outcome==='success'?'Your place is saved.':'Could not save');
}
function compileComponent(file,name,dependencies) {
  const source=read(file).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
  const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(dependencies),`${code};return ${name};`)(...Object.values(dependencies));
}
const Link=({href,children,...props})=>React.createElement('a',{href,...props},children);
function hookHarness() {
  const states=[],refs=[];let index=0,refIndex=0;const effects=[];
  return {states,effects,reset(){index=0;refIndex=0;},useState(initial){const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useEffect:fn=>effects.push(fn),useMemo:fn=>fn()};
}
const hooks=hookHarness();
const Gatherings=compileComponent('components/member/community-gatherings.tsx','CommunityGatherings',{React,Link,...hooks,createClient:()=>({}),memberErrorMessage:()=>'',CommunityGatheringInline:()=>null,CommunityVideoLibrary:()=>null,CommunityGatheringPlanner:()=>React.createElement('p',{},'Inline planner')});
const props={cards:[],migrationReady:true,slug:'test',communityId:'community-one',currentUserId:'host-one'};
const renderGatherings=extra=>{hooks.reset();return Gatherings({...props,...extra});};
assert(!renderToStaticMarkup(renderGatherings({canManage:false})).includes('Create a gathering'));
assert(!renderToStaticMarkup(renderGatherings({canManage:true})).includes('Inline planner'));
function find(element,predicate) {if(!element)return null;if(Array.isArray(element)){for(const item of element){const found=find(item,predicate);if(found)return found;}return null;}if(typeof element!=='object')return null;return predicate(element)?element:find(element.props?.children,predicate);}
let tree=renderGatherings({canManage:true});
find(tree,e=>e.type==='button'&&e.props['aria-controls']==='community-inline-planner').props.onClick();
tree=renderGatherings({canManage:true});assert(renderToStaticMarkup(tree).includes('Inline planner'));
find(tree,e=>e.type==='button'&&e.props['aria-controls']==='community-inline-planner').props.onClick();
tree=renderGatherings({canManage:true});assert(find(tree,e=>e.props?.id==='community-inline-planner').props.hidden);assert(renderToStaticMarkup(tree).includes('Inline planner'),'Hiding must retain the planner and its draft');

for(const outcome of ['success','denied','throw','stale']) {
  const h=hookHarness();const calls=[];let resolve;
  const rpc=async(name,args)=>{calls.push([name,args]);if(outcome==='throw')throw Error('Offline');if(outcome==='stale')return new Promise(done=>resolve=done);return {data:[],error:outcome==='denied'?Error('Host required'):null};};
  const Planner=compileComponent('components/member/community-gathering-planner.tsx','CommunityGatheringPlanner',{React,...h,createClient:()=>({rpc}),memberErrorMessage:()=> 'Could not load',dynamic:()=>()=>React.createElement('p',{},'Ready planner')});
  const render=()=>{h.reset();return Planner(props);};
  assert(renderToStaticMarkup(render()).includes('Loading your gathering drafts'));assert.equal(calls.length,0);
  const cleanup=h.effects[0]();
  if(outcome==='stale'){cleanup();resolve({data:[],error:null});}
  await new Promise(done=>setImmediate(done));
  assert.deepEqual(calls,[['list_my_community_event_proposals',{p_community_id:'community-one'}]]);
  const html=renderToStaticMarkup(render());
  if(outcome==='success')assert(html.includes('Ready planner'));
  else if(outcome==='stale')assert(html.includes('Loading your gathering drafts'));
  else {assert(html.includes('Could not load'));assert(html.includes('Try again'));assert(!html.includes('Ready planner'));}
}
assert(read('app/events/[slug]/page.tsx').includes('<Link href="/events">All events</Link>'));
for(const file of ['app/events/[slug]/pass/page.tsx','app/events/[slug]/feedback/page.tsx','app/events/[slug]/follow-up/page.tsx','app/events/[slug]/register/page.tsx','app/events/[slug]/rounds/page.tsx','app/events/[slug]/meet/page.tsx','app/events/[slug]/meet/[code]/page.tsx','components/events/event-round-attendee.tsx','components/events/event-round-host.tsx','components/events/event-intro-workspace.tsx']) {
  assert(!read(file).includes('className="brand" href="/"'),`${file} must return signed-in members Home`);
}
const dm=read('supabase/migrations/20260723130000_private_messaging.sql');
assert(dm.includes('Accepted unblocked connection required'));
assert(dm.includes("c.status='accepted'"));
const proposalSql=read('supabase/migrations/20260809140000_community_hosted_event_proposals.sql');
assert(proposalSql.includes('if not public.can_manage_community(p_community_id) then'));
console.log('Navigation/gathering usability passed: guarded SPA messaging, RSVP failure recovery, Host-only on-demand planner with retained draft, stale-response protection and home links. Database/real-device acceptance remains separate.');
