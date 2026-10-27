import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {formatEventTimeInput,parseEventTimeInput} from "../lib/events/zoned-datetime.ts";
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const source=ts.transpileModule(read("lib/events/save-host-poster.ts"),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {saveHostPoster}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const input={eventId:"event",path:"new",file:{type:"image/png"},alt:"A gathering poster",previousDraft:"old-draft",previousPublished:"live"};
function mock(options={}) {
  const removed=[];
  const bucket={upload:async()=>({error:options.uploadError??null}),remove:async paths=>{removed.push(...paths);if(options.cleanupThrows)throw Error("offline");return {error:options.cleanupError??null};}};
  const query={select(){return this;},eq(){return this;},async maybeSingle(){if(options.readThrows)throw Error("offline");return {data:options.record??null,error:options.readError??null};}};
  const client={storage:{from:()=>bucket},rpc:async()=>{if(options.saveThrows)throw Error("timeout");return {error:options.saveError??null};},from:()=>query};
  return {client,removed};
}
let m=mock({uploadError:Error("upload denied")});
await assert.rejects(saveHostPoster(m.client,input),/upload denied/);assert.deepEqual(m.removed,[]);
for(const options of [{saveError:Error("timeout")},{saveThrows:true,readThrows:true}]) {
  m=mock(options);await assert.rejects(saveHostPoster(m.client,input),/could not confirm/);assert.deepEqual(m.removed,[]);
}
m=mock({saveThrows:true,record:{draft_storage_path:"new",published_storage_path:"new"}});
assert.equal((await saveHostPoster(m.client,input)).status,"live");assert.deepEqual(m.removed,["old-draft"]);
m=mock({readThrows:true});assert.equal((await saveHostPoster(m.client,input)).status,"saved");
m=mock({record:{draft_storage_path:"new",published_storage_path:"live"},cleanupThrows:true});
assert.deepEqual(await saveHostPoster(m.client,input),{status:"private",cleanupPending:true});
m=mock();await saveHostPoster(m.client,{...input,previousDraft:"live"});assert.deepEqual(m.removed,[]);
const workspace=read("components/events/event-host-workspace.tsx");
assert(workspace.includes('communityDraftKey(currentUserId,"event-host",initial.event_id)'));
assert(workspace.includes("useCommunityFileGuard(Boolean(coverFile)"));
assert(workspace.includes("finally{setBusy(false);setBusyAction(null);}"));
assert(workspace.includes("Selected image — not saved yet"));
assert(read("app/events/[slug]/host/page.tsx").includes("event-host-extra-tools"));
const compiledWorkspace=ts.transpileModule(workspace.replace(/^import[\s\S]*?;\n/gm,"").replace(/^export /gm,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
function workspaceHarness(hash="",tools=true){
  let values=[],cursor=0,effects=[];const listeners=new Map(),history=[];
  const location={href:`https://www.herafricatable.com/events/example/host?keep=yes${hash}`,hash};
  const useState=initial=>{const index=cursor++;if(!(index in values))values[index]=typeof initial==="function"?initial():initial;return [values[index],next=>{values[index]=typeof next==="function"?next(values[index]):next;}];};
  const useRef=initial=>{const index=cursor++;return values[index]??={current:initial};};
  const window={location,history:{replaceState:(state,title,url)=>{history.push(url);const next=new URL(url,location.href);location.href=next.href;location.hash=next.hash;}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const stub=()=>null,calls=[];
  const deps={React,useState,useRef,useEffect:fn=>effects.push(fn),useMemo:fn=>fn(),useRouter:()=>({refresh(){throw Error("Section selection must not reload the page");}}),createClient:()=>({rpc:()=>{calls.push("write");throw Error("No database writes allowed");}}),
    formatEventTimeInput,parseEventTimeInput,Link:({href,children,...props})=>React.createElement("a",{href,...props},children),EventHostPublicDetails:stub,EventImageDisplayOptions:stub,ActionFeedback:stub,
    useCommunityDraft:(key,initial)=>{const [value,setValue]=useState(initial);return [value,setValue,setValue,false];},communityDraftKey:()=>"test-draft",useCommunityFileGuard:stub,useActionDialog:()=>({ask:async()=>false,dialog:null}),useActionFeedback:()=>({feedback:null,setMessage(){}}),saveHostPoster:stub,memberErrorMessage:stub,window};
  const Component=new Function(...Object.keys(deps),`${compiledWorkspace};return EventHostWorkspace;`)(...Object.values(deps));
  const props={currentUserId:"test",initial:{event_id:"test",event_slug:"example",event_title:"Example",event_status:"published",starts_at:"2035-01-01T15:00:00Z",ends_at:"2035-01-01T18:00:00Z",timezone:"Africa/Nairobi",workspace_status:"draft",summary:"",arrival_info:"",programme:[],partners:[],review_note:null},cover:null,coverReady:true,outcomes:null,communities:[],communityLinksReady:true,networking:tools?React.createElement("p",null,"Networking fixture"):undefined,arrival:tools?React.createElement("p",null,"Attendance fixture"):undefined};
  const render=()=>{cursor=0;effects=[];return Component(props);};
  render();const cleanups=effects.map(fn=>fn());
  const nodes=node=>!node||typeof node!=="object"?[]:[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];
  const text=node=>typeof node==="string"?node:React.Children.toArray(node?.props?.children).map(text).join("");
  return {history,calls,location,listeners,render,html:()=>renderToStaticMarkup(render()),button:label=>nodes(render()).find(node=>node.type==="button"&&text(node)===label),cleanup:()=>cleanups.forEach(fn=>fn?.())};
}
const tabs=workspaceHarness();tabs.button("Networking").props.onClick();
assert.equal(tabs.history.at(-1),"/events/example/host?keep=yes#host-networking");
assert(tabs.button("Networking").props["aria-pressed"]);assert(tabs.html().includes("Networking fixture"));
tabs.button("Guests & check-in").props.onClick();assert.equal(tabs.history.at(-1),"/events/example/host?keep=yes#host-guests");assert(tabs.html().includes("Attendance fixture"));
assert.equal(tabs.calls.length,0);tabs.cleanup();assert.equal(tabs.listeners.size,0);
for(const [hash,label] of [["#host-networking","Networking"],["#host-guests","Guests & check-in"],["#host-programme","Schedule"]]){
  const refreshed=workspaceHarness(hash);assert(refreshed.button(label).props["aria-pressed"],`${label} restores from refresh/share URL`);assert.equal(refreshed.history.length,0);refreshed.cleanup();
}
const noTools=workspaceHarness("#host-networking",false);assert(noTools.button("Event details").props["aria-pressed"],"unavailable section cannot produce a blank workspace");noTools.cleanup();
const external=workspaceHarness("#host-invites");assert(external.button("Event details").props["aria-pressed"]);external.location.hash="#host-guests";external.listeners.get("hashchange")();assert(external.button("Guests & check-in").props["aria-pressed"]);external.location.hash="";external.listeners.get("popstate")();assert(external.button("Event details").props["aria-pressed"]);external.cleanup();
console.log("Event Host resilience: poster ambiguity, published-file preservation, cleanup recovery and draft/file guards passed.");
console.log("Host section selection, refresh/share restoration, unavailable links and history cleanup passed without writes.");
