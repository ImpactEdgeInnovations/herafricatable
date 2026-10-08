import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
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
console.log("Event Host resilience: poster ambiguity, published-file preservation, cleanup recovery and draft/file guards passed.");
