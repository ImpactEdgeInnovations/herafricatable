import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const host=read("components/member/community-host-workspace.tsx");
const review=host.slice(host.indexOf("  async function review("),host.indexOf("  async function updateProgramming("));
const source=ts.transpileModule(`export function harness(context){const {actionBusy,setBusy,setMessage,ask,supabase,router,memberErrorMessage}=context;${review}return review;}`,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {harness}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const member={membership_id:"membership",display_name:"Test member"};
function context(options={}){
  const calls=[],prompts=[],messages=[],states=[];
  return {calls,prompts,messages,states,actionBusy:{current:false},setBusy:value=>states.push(value),setMessage:value=>messages.push(value),ask:async value=>{prompts.push(value);return options.confirm??false;},supabase:{rpc:async(name,args)=>{calls.push({name,args});if(options.rpc)return options.rpc();return {error:null};}},router:{refresh(){}},memberErrorMessage:()=>"Please try again."};
}
let ctx=context();await harness(ctx)(member,"promote");assert.equal(ctx.calls.length,0);assert.equal(ctx.prompts[0].confirmLabel,"Make moderator");assert.equal(ctx.actionBusy.current,false);assert.equal(ctx.states.at(-1),"");
ctx=context();await harness(ctx)(member,"remove");assert.equal(ctx.calls.length,0);assert.equal(ctx.prompts[0].tone,"danger");
ctx=context({confirm:true});await harness(ctx)(member,"promote");assert.deepEqual(ctx.calls,[{name:"review_community_membership",args:{p_action:"promote",p_membership_id:"membership"}}]);
let release;ctx=context({rpc:()=>new Promise(resolve=>{release=resolve;})});let run=harness(ctx);const pending=run(member,"approve");await run(member,"decline");assert.equal(ctx.calls.length,1);release({error:null});await pending;assert.equal(ctx.actionBusy.current,false);
ctx=context({rpc:async()=>{throw Error("offline");}});await harness(ctx)(member,"approve");assert.equal(ctx.actionBusy.current,false);assert.equal(ctx.states.at(-1),"");assert.equal(ctx.messages.at(-1),"Please try again.");
const editor=read("components/events/event-host-public-details.tsx");
for(const token of ['communityDraftKey(currentUserId,"event-host-public",eventId)','readCommunityDraft<typeof blank>(draftKey)','clearDraft(snapshot)','clearDraft(saved)','if(!ready||busy)return','Try loading again','saved.enabled?','if(!live)return','Share and save'])assert(editor.includes(token),`Missing Host editor recovery: ${token}`);
assert(!editor.includes("localStorage")&&!editor.includes("sessionStorage"));
assert(host.includes('title:"Invite a moderator?"'));
console.log("Host control recovery passed: declined role changes, duplicate protection, thrown-request recovery and private tab-draft contracts. Real-account acceptance remains separate.");
