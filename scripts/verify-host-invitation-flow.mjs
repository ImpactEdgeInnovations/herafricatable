import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseInvitationEmails} from '../lib/invitation-emails.ts';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const compile=source=>ts.transpileModule(source.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
let parsed=parseInvitationEmails(' A@Example.com, b@example.com\nA@example.com; c+tag@example.org,');
assert.deepEqual(parsed.emails,['a@example.com','b@example.com','c+tag@example.org']);assert.equal(parsed.duplicates,1);assert.equal(parsed.invalid.length,0);
for(const value of ['Name <a@example.com>','bad address','a@@x.com','a@x'])assert(parseInvitationEmails(value).invalid.length);
assert(parseInvitationEmails(Array.from({length:21},(_,i)=>`member${i}@example.invalid`).join(',')).tooMany);

const invitation=read('components/member/destination-invitation-panel.tsx');
const sendSource=invitation.slice(invitation.indexOf('  async function send('),invitation.indexOf('  return <section'));
const makeSend=new Function('context',`${compile(`const {lock,ready,parsed,setMessage,draft,setBusy,ask,supabase,destinationId,destinationType,destinationName,setResults,clearDraft,fetch,refreshHistory,router,memberErrorMessage}=context;${sendSource}`)};return send;`);
function context(options={}){const calls=[],states=[],messages=[],drafts=[];return {calls,states,messages,drafts,lock:{current:false},ready:true,parsed:parseInvitationEmails('a@example.invalid,b@example.invalid'),setMessage:v=>messages.push(v),draft:{email:'a@example.invalid,b@example.invalid',note:'Please join this test Community.',preset:''},setBusy:v=>states.push(v),ask:async()=>options.cancel?false:{},supabase:{rpc:async(name,args)=>{calls.push({name,args});if(options.throw)throw Error('network');return {data:options.rows??[{invitation_id:'one',invitee_email:'a@example.invalid',invitation_status:'sent',created:true},{invitation_id:'two',invitee_email:'b@example.invalid',invitation_status:'sent',created:true}],error:null};}},destinationId:'test',destinationType:'community',destinationName:'Test Community',setResults(){},clearDraft:v=>drafts.push(v),fetch:async(url,request)=>{calls.push({url,body:JSON.parse(request.body)});if(options.deliveryThrows)throw Error('network');return {ok:true,json:async()=>({sent:2})};},refreshHistory:async()=>{},router:{refresh(){}},memberErrorMessage:()=> 'Please try again.'};}
const event={preventDefault(){}};
let ctx=context({cancel:true});await makeSend(ctx)(event);assert.equal(ctx.calls.length,0);assert(!ctx.lock.current);assert.equal(ctx.states.at(-1),false);
ctx=context();await makeSend(ctx)(event);assert.equal(ctx.calls[0].name,'create_table_invitation_batch');assert.deepEqual(ctx.calls[0].args.p_emails,['a@example.invalid','b@example.invalid']);assert.deepEqual(ctx.calls[1].body,{invitationIds:['one','two']});assert.equal(ctx.drafts[0].email,'');assert(ctx.messages.at(-1).includes('2 emails sent.'));
ctx=context({deliveryThrows:true});await makeSend(ctx)(event);assert(!ctx.messages.at(-1).includes('emails sent'));assert(ctx.messages.at(-1).includes('saved'));assert(!ctx.lock.current);
ctx=context({rows:[{invitation_id:'one',invitee_email:'a@example.invalid',invitation_status:'sent',created:true},{invitation_id:null,invitee_email:'b@example.invalid',invitation_status:'not_created',created:false,error_message:'Daily limit'}]});await makeSend(ctx)(event);assert.equal(ctx.drafts[0].email,'b@example.invalid');assert(ctx.messages.at(-1).includes('could not be saved'));
ctx=context({throw:true});await makeSend(ctx)(event);assert.equal(ctx.drafts.length,0);assert(!ctx.lock.current);assert.equal(ctx.states.at(-1),false);

const routeCode=compile(read('app/api/member/invitations/deliver/route.ts'));
function route(options={}){const calls=[];const client={auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:'owner'}}})},from(){return {select(){return this;},in(key,ids){this.ids=ids;return this;},eq(key,value){assert.equal(key,'inviter_id');assert.equal(value,'owner');return Promise.resolve({data:options.foreign?[]:this.ids.map(id=>({id,status:options.notReady?'pending_review':'sent'})),error:null});}};}};const POST=new Function('NextResponse','createClient','processNotificationQueue',`${routeCode};return POST;`)({json:(body,init)=>Response.json(body,init)},async()=>client,async options=>{calls.push(options);return Response.json({sent:1,claimed:1,failed:0});});return {POST,calls};}
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
const request=(body,origin='https://www.herafricatable.com')=>new Request('https://www.herafricatable.com/api/member/invitations/deliver',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
let r=route();let response=await r.POST(request({invitationIds:ids}));assert.equal(response.status,200);assert.equal((await response.json()).sent,2);assert.deepEqual(r.calls,ids.map(id=>({dedupeKey:`table-invitation:${id}`,strictTarget:true})));
for(const [options,body,origin,status] of [[{signedOut:true},{invitationIds:ids},undefined,401],[{foreign:true},{invitationIds:ids},undefined,403],[{notReady:true},{invitationIds:ids},undefined,403],[{},{invitationIds:[ids[0],ids[0]]},undefined,400],[{},{invitationIds:ids},'https://other.invalid',403]]){r=route(options);assert.equal((await r.POST(request(body,origin))).status,status);assert.equal(r.calls.length,0);}

const shell=read('components/member/host-tools-shell.tsx');
const tools=new Function('React','createContext','useCallback','useContext','useEffect','useState',`${compile(shell)};return {HostToolsShell,HostToolArea};`)(React,React.createContext,React.useCallback,React.useContext,React.useEffect,React.useState);
const tree=React.createElement(tools.HostToolsShell,null,['overview','people','meetups','appearance','settings'].map(area=>React.createElement(tools.HostToolArea,{area,key:area},React.createElement('textarea',{defaultValue:`Retained ${area} draft`}))));
const markup=renderToStaticMarkup(tree);assert.equal((markup.match(/role="tab"/g)||[]).length,5);assert.equal((markup.match(/aria-selected="true"/g)||[]).length,1);assert.equal((markup.match(/hidden=""/g)||[]).length,4);assert(markup.includes('Retained people draft')&&markup.includes('role="tabpanel"'));
for(const file of ['components/member/member-profile-actions.tsx','components/member/network-hub.tsx','components/member/community-connection-actions.tsx','components/events/event-attendee-directory.tsx','components/member/cohort-activation.tsx']){assert(read(file).includes('request_connection_with_context'));assert(read(file).includes('p_introduction_note'));}
assert(read('components/member/network-hub.tsx').includes('View profile &amp; note'));
console.log('Host/invitation flow passed: email normalization, duplicates/invalid/limits, explicit review, cancellation, partial-failure retention, uncertain delivery honesty, own-only targeted route, CSRF guard, five retained Host areas, accessible tabs and optional connection notes in all entry points. No live emails sent.');
