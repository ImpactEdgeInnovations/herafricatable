import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
function page(file, name, context) {
  const source=readFileSync(new URL(`../${file}`,import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace(/export default /g,'').replace(/^export /gm,'');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,module:ts.ModuleKind.None}}).outputText;
  return new Function(...Object.keys(context),`${code};return ${name};`)(...Object.values(context));
}
const Waiting=()=>null,Form=()=>null;
function client(mode,status='submitted',access='pending') {
  return {auth:{getUser:async()=>({data:{user:{id:'test',email:'test@example.invalid'}}})},
    rpc:async name=>({data:name==='get_membership_intake_mode'?mode:[],error:null}),
    from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='profiles'?{access_status:access}:status?{status}:null,error:null})};}};
}
const redirect=destination=>{throw new Error(`REDIRECT:${destination}`);};
for(const mode of ['trusted_auto','manual_review','closed'])for(const status of ['submitted','in_review',null]) {
  const home=page('app/home/page.tsx','MemberHomePage',{React,createClient:async()=>client(mode,status),redirect,MembershipWaitingRoom:Waiting});
  if(mode==='trusted_auto')await assert.rejects(home(),/REDIRECT:\/apply$/);
  else {const result=await home();assert.equal(result.type,Waiting);assert.equal(result.props.status,status);}
}
const onboarding=page('app/home/page.tsx','MemberHomePage',{React,createClient:async()=>client('trusted_auto','approved','onboarding'),redirect});
await assert.rejects(onboarding(),/REDIRECT:\/onboarding$/);
function findForm(node) {if(!node||typeof node!=='object')return null;if(node.type===Form)return node;if(Array.isArray(node)){for(const child of node){const found=findForm(child);if(found)return found;}return null;}return findForm(node.props?.children);}
for(const mode of ['trusted_auto','manual_review'])for(const status of ['submitted','in_review',null]) {
  const apply=page('app/apply/page.tsx','MembershipApplicationPage',{React,Link:()=>null,SignOutButton:()=>null,MembershipApplicationForm:Form,createClient:async()=>client(mode,status),redirect,safeInternalDestination:()=>null});
  const result=await apply({searchParams:Promise.resolve({})});
  assert.equal(findForm(result).props.startEditing,mode==='trusted_auto'&&status!==null);
}
console.log('Pilot registration resume passed: earlier requests reopen during automatic intake, manual/closed waiting stays intact, approved members continue to profile setup.');

const signout=readFileSync(new URL('../components/auth/sign-out-button.tsx',import.meta.url),'utf8');
const signoutBody=signout.slice(signout.indexOf('  async function signOut()'),signout.indexOf('  return ('));
for(const outcome of ['success','denied','throw']) {
  const events=[],busy=[],failed=[];
  const signOut=new Function('createClient','setBusy','setFailed','clearCommunityDrafts','window',`${signoutBody};return signOut;`)(
    ()=>({auth:{signOut:async options=>{assert.equal(options.scope,'local');if(outcome==='throw')throw Error('Offline');return {error:outcome==='denied'?Error('Denied'):null};}}}),
    value=>busy.push(value),value=>failed.push(value),()=>events.push('clear-drafts'),{location:{replace:href=>events.push(href)}});
  await signOut();assert.equal(busy.at(-1),false);assert.equal(failed.at(-1),outcome!=='success');
  assert.deepEqual(events,outcome==='success'?['clear-drafts','/']:[]);
}
console.log('Account switching sign-out passed: local session scope, drafts cleared after success, and failed requests remain recoverable.');
