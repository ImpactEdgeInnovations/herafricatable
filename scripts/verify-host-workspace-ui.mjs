import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const workspace = read('components/events/event-host-workspace.tsx');
const saveSource = workspace.slice(workspace.indexOf('  async function save('), workspace.indexOf('  function communityPanel('));
const code = ts.transpileModule(`export function harness(context){const {busy,setMessage,summary,arrivalInfo,programme,partners=[],parseEventTimeInput,initial,setBusy,setBusyAction,supabase,setSavedDraft,draft,clearDraft,selfPublish,router,memberErrorMessage}=context;${saveSource}return save;}`, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { harness } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function context(options = {}) {
  const calls = [], messages = [], states = [], actions = [], cleared = [];
  return { calls, messages, states, actions, cleared, busy:false, summary:'A clear introduction to a welcoming event for local members.', arrivalInfo:'Arrive ten minutes early and bring a notebook.', programme:[{title:'Introductions',starts_at:'2026-10-26T10:00',ends_at:'2026-10-26T11:00'}], parseEventTimeInput:v=>new Date(v+'Z').toISOString(), initial:{timezone:'UTC',event_id:'fixture'},setMessage:v=>messages.push(v),setBusy:v=>states.push(v),setBusyAction:v=>actions.push(v),supabase:{rpc:async(name,args)=>{calls.push({name,args});if(options.throwAt===calls.length)throw Error('network');return {error:options.errorAt===calls.length?Error('denied'):null};}},setSavedDraft(){},draft:{summary:'Draft'},clearDraft:v=>cleared.push(v),selfPublish:options.selfPublish??false,router:{refresh(){}},memberErrorMessage:()=> 'Please try again.' };
}
let ctx=context();await harness(ctx)(false);
assert.deepEqual(ctx.calls.map(c=>c.name),['save_event_host_workspace']);assert.equal(ctx.messages.at(-1),'Draft saved privately.');assert.equal(ctx.actions.at(-1),null);
ctx=context();await harness(ctx)(true);assert.deepEqual(ctx.calls.map(c=>c.name),['save_event_host_workspace','submit_event_host_workspace']);assert(ctx.messages.at(-1).includes('not public yet'));
ctx=context({selfPublish:true});await harness(ctx)(true);assert.equal(ctx.calls[1].name,'publish_my_pilot_event_updates');assert(ctx.messages.at(-1).includes('Your changes are live'));
for(const options of [{errorAt:2},{throwAt:2}]) {ctx=context(options);await harness(ctx)(true);assert(ctx.messages.at(-1).startsWith('Your draft was saved.'));assert(!ctx.messages.at(-1).includes('live'));assert.equal(ctx.cleared.length,1);assert.equal(ctx.states.at(-1),false);assert.equal(ctx.actions.at(-1),null);}
ctx=context({errorAt:1});await harness(ctx)(false);assert.equal(ctx.cleared.length,0);assert.equal(ctx.states.at(-1),false);
ctx=context();ctx.busy=true;await harness(ctx)(true);assert.equal(ctx.calls.length,0);
ctx=context();ctx.summary='Too short';await harness(ctx)(true);assert.equal(ctx.calls.length,0);
assert(workspace.includes('primarySections = [["introduction", "Event details"], ["image", "Poster"], ["programme", "Schedule"]]'));
assert(workspace.includes('aria-label="More event sections"') && workspace.includes('href="#host-invites"'));
assert(workspace.includes('disabled={busy || !dirty}') && workspace.includes('result.cleanupPending'));
const tools=read('components/events/event-host-extra-tools.tsx');
const toolsCode=ts.transpileModule(tools.replace(/^import .*;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.None}}).outputText;
for (const id of ['host-invites','host-bookings','host-cancel','unrelated']) {
  const panel={open:false,querySelector:()=>({focus:()=>{panel.focused=true;}})};let cleanup;const listeners=[];
  const Tools=new Function('React','useEffect','useRef','window',`${toolsCode};return EventHostExtraTools;`)(React,fn=>{cleanup=fn();},()=>({current:{querySelector:()=>panel}}),{location:{hash:'#'+id},addEventListener:(...args)=>listeners.push(args),removeEventListener:(...args)=>listeners.push(args)});
  Tools({children:null});assert.equal(panel.open,id!=='unrelated');assert.equal(Boolean(panel.focused),id!=='unrelated');cleanup();assert.equal(listeners[1][0],'hashchange');assert.equal(listeners[0][1],listeners[1][1]);
}
console.log('Host workspace UI behaviour passed: private/publish/review outcomes, partial-save error honesty, busy cleanup, three main sections and in-page invitation expansion. Real uploads and publication remain separate acceptance.');
