import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import React from 'react';
import ts from 'typescript';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {renderEventTicketPdf} from '../lib/events/ticket-pdf.ts';
import {ticketInvitationLinks} from '../lib/events/ticket-invitations.mjs';
import {ticketConfirmationContent} from '../lib/notifications/ticket-confirmation.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const compile=s=>ts.transpileModule(s.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
function harness(props={}){
 let index=0,states=[],refs=[],effects=[],calls=[],refreshes=0,saveFails=false,verifyFails=false,sendFails=false,hold=null;
 const client={auth:{signInWithOtp:async args=>{calls.push(['send',args]);if(hold)await hold;return {error:sendFails?{}:null};},verifyOtp:async args=>{calls.push(['verify',args]);return {error:verifyFails?{}:null,data:{session:verifyFails?null:{}}};}},rpc:async(name,args)=>{calls.push([name,args]);return {error:saveFails?{}:null};}};
 const context={React,Link:({children,...p})=>React.createElement('a',p,children),useRouter:()=>({refresh(){refreshes++;}}),createClient:()=>client,styles:{},useMemo:fn=>fn(),useState:initial=>{const key=index++;if(!(key in states))states[key]=initial;return [states[key],next=>{states[key]=typeof next==='function'?next(states[key]):next;}];},useRef:initial=>{const key=index++;return refs[key]??=( {current:initial});},useEffect:fn=>effects.push(fn)};
 const Component=new Function(...Object.keys(context),`${compile(read('components/events/event-guest-entry.tsx'))};return EventGuestEntry;`)(...Object.values(context));
 function render(){index=0;effects=[];return Component({eventId:'event',eventTitle:'A public event',...props});}
 function nodes(tree){return tree==null||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];}
 const form=()=>nodes(render()).find(n=>n.type==='form');
 const input=label=>nodes(render()).find(n=>n.type==='input'&&(n.props.autoComplete===label||n.props.type===label));
 return {render,nodes,input,form,calls,set saveFails(v){saveFails=v;},set verifyFails(v){verifyFails=v;},set sendFails(v){sendFails=v;},set hold(v){hold=v;},get refreshes(){return refreshes;},settle:()=>new Promise(r=>setImmediate(r)),mount:()=>effects.forEach(fn=>fn()),fill:()=>{input('name').props.onChange({target:{value:'Guest Test'}});input('email').props.onChange({target:{value:'guest@example.invalid'}});input('checkbox').props.onChange({target:{checked:true}});}};
}
const event={preventDefault(){}};
const h=harness();h.render();h.mount();h.form().props.onSubmit(event);await h.settle();assert.equal(h.calls.length,0,'name and consent required');
h.fill();let release;h.hold=new Promise(r=>release=r);const submit=h.form().props.onSubmit;submit(event);submit(event);await h.settle();assert.equal(h.calls.length,1,'synchronous lock blocks duplicate OTP');release();await h.settle();
assert.equal(h.calls[0][1].options.shouldCreateUser,true);assert(h.input('one-time-code'));assert(!h.nodes(h.render()).some(n=>n.type==='button'&&n.props.children==='Resend code'),'resend cooldown');
h.input('one-time-code').props.onChange({target:{value:'12345678'}});h.verifyFails=true;h.form().props.onSubmit(event);await h.settle();assert.equal(h.refreshes,0);assert.equal(h.calls.filter(c=>c[0]==='save_my_event_guest_details').length,0);
h.verifyFails=false;h.saveFails=true;h.form().props.onSubmit(event);await h.settle();assert(h.input('name'),'verified email returns to details if save fails');assert.equal(h.refreshes,0);
assert(h.nodes(h.render()).some(n=>n.props?.role==='alert'&&String(n.props.children).includes('email is confirmed')),'details failure is not reported as invalid OTP');
const verifies=h.calls.filter(c=>c[0]==='verify').length;h.saveFails=false;h.form().props.onSubmit(event);await h.settle();assert.equal(h.refreshes,1);assert.equal(h.calls.filter(c=>c[0]==='verify').length,verifies,'retry does not verify OTP twice');
assert.deepEqual(h.calls.at(-1),['save_my_event_guest_details',{p_event_id:'event',p_display_name:'Guest Test',p_agreed:true}]);
const signed=harness({signedIn:true,initialName:'Guest',initialEmail:'guest@example.invalid'});signed.input('checkbox').props.onChange({target:{checked:true}});signed.form().props.onSubmit(event);await signed.settle();assert.equal(signed.calls[0][0],'save_my_event_guest_details');assert.equal(signed.calls.length,1);
const blocked=harness({ready:false});assert.equal(blocked.form(),undefined);assert.equal(blocked.calls.length,0);
const sample={event_id:'00000000-0000-4000-8000-000000000000',event_slug:'sample-event',event_title:'[SAMPLE] Founders at the Table',starts_at:'2026-12-12T15:00:00Z',ends_at:'2026-12-12T17:00:00Z',timezone:'Africa/Nairobi',venue:'Geco Cafe, Nairobi',guest_name:'Sample Guest',ticket_type:'Free admission',booking_reference:'SAMPLE NOT VALID',host_name:'Sample Host',organisation_name:'Example',qr_payload:'HATCHECKIN:00000000-0000-4000-8000-000000000000:SAMPLE',manual_code:'SAMPLE2026',issued_at:'2026-11-04T06:00:00Z',checked_in_at:null,event_ended:false,guest_only:true,community:{name:'Women building businesses together in Nairobi',slug:'sample-community'}};
assert.equal(ticketInvitationLinks({...sample,guest_only:false,community:null}).length,0);
assert.equal(ticketInvitationLinks({...sample,community:{name:'Private',slug:'../private'}}).length,1,'invalid Community URL omitted');
const links=ticketInvitationLinks(sample);assert.equal(links.length,2);assert(links.every(l=>new URL(l.href).origin==='https://www.herafricatable.com'));assert(links.every(l=>!l.href.includes(sample.qr_payload)));
const content=ticketConfirmationContent(sample);assert(content.afterDetails.includes('not required to attend'));assert.deepEqual(content.secondaryLinks,links);
const pdf=await PDFDocument.load(await renderEventTicketPdf(sample));assert.equal(pdf.getPageCount(),1);const annotations=pdf.getPages()[0].node.Annots();assert.equal(annotations.size(),2);for(let i=0;i<2;i++){const a=pdf.context.lookup(annotations.get(i));const uri=a.lookup(PDFName.of('A')).lookup(PDFName.of('URI'));assert(uri instanceof PDFString);assert.equal(uri.decodeText(),links[i].href);}
const migration=read('supabase/migrations/'+readdirSync(new URL('../supabase/migrations',import.meta.url)).find(n=>n.endsWith('_event_first_guest_booking.sql')));
assert(migration.startsWith('begin;')&&migration.trim().endsWith('commit;'));assert(migration.includes('enable row level security'));assert(!migration.includes('set_feature_flag('),'migration does not open release gate');assert(!/set access_status|insert into public.user_roles|insert into public.community_memberships/.test(migration),'no implicit membership or Community join');
console.log('PASS: inline guest form consent/OTP/resend/double-submit/error retry, existing identity path, fail-closed state, optional ticket/email/PDF invitations and safe migration contracts. Mocked UI tests are not browser/inbox acceptance.');
