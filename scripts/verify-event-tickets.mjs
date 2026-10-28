import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {renderEventTicketPdf,ticketFilename} from '../lib/events/ticket-pdf.ts';
import {ticketConfirmationBody,ticketConfirmationContent} from '../lib/notifications/ticket-confirmation.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const compile=s=>ts.transpileModule(s.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const sample={event_id:'00000000-0000-4000-8000-000000000000',event_slug:'sample-event',event_title:'Founders at the Table - SAMPLE',starts_at:'2026-12-12T15:00:00Z',ends_at:'2026-12-12T17:00:00Z',timezone:'Africa/Nairobi',venue:'Geco Cafe, Mbaazi Road, Lavington, Nairobi',guest_name:'Amina Mwangi (example)',ticket_type:'Complimentary admission',booking_reference:'SAMPLE - NOT VALID FOR ENTRY',host_name:'Seina N. (example)',organisation_name:'Her Africa Table - example',qr_payload:'HATCHECKIN:00000000-0000-4000-8000-000000000000:SAMPLE-NOT-VALID',manual_code:'SAMPLE2026',issued_at:'2026-10-28T06:00:00Z',checked_in_at:null,event_ended:false,arrival_info:'Please arrive 15 minutes before the event. Show your ticket at the welcome desk.',networking:{starts_at:'2026-12-12T15:30:00Z',ends_at:'2026-12-12T16:00:00Z',minutes:5}};
const bytes=await renderEventTicketPdf(sample);
assert(Buffer.from(bytes).subarray(0,5).toString()==='%PDF-');assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);assert(bytes.length<500000,'email attachment remains small');
assert.deepEqual(await renderEventTicketPdf(sample),bytes,'same snapshot generates identical retry bytes');
await renderEventTicketPdf({...sample,event_title:'A long event title '.repeat(25),guest_name:'Ẹniọlá Žuri N’Diaye'.repeat(7),venue:'A long venue address '.repeat(25),organisation_name:'Organisation '.repeat(25),ticket_type:'An unusually long ticket description '.repeat(12)});
await assert.rejects(renderEventTicketPdf({...sample,qr_payload:'wrong-event'}));
assert(!ticketFilename('../../private\r\nContent-Type:bad').includes('\r'));assert(!ticketFilename('../../private').includes('/'));

let user={id:'member'},data=sample,error=null,renders=0,renderFails=false;
const route=new Function('createClient','renderEventTicketPdf','ticketFilename',`${compile(read('app/events/[slug]/ticket.pdf/route.ts'))};return GET;`)(async()=>({auth:{getUser:async()=>({data:{user}})},rpc:async(name,args)=>{assert.equal(name,'get_my_event_ticket');assert.deepEqual(args,{p_slug:'sample-event'});return {data,error};}}),async ticket=>{renders++;if(renderFails)throw Error('font unavailable');return bytes;},ticketFilename);
const request=()=>route(new Request('https://www.herafricatable.com/events/sample-event/ticket.pdf'),{params:Promise.resolve({slug:'sample-event'})});
let response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert(response.headers.get('content-disposition').includes('attachment'));assert(response.headers.get('cache-control').includes('no-store'));assert(response.headers.get('x-robots-tag').includes('noindex'));
user=null;response=await request();assert.equal(response.status,401);assert.equal(renders,1);
user={id:'other'};data=null;response=await request();assert.equal(response.status,404);assert.equal(renders,1);
error={code:'PGRST202',message:'Private DB detail'};response=await request();assert.equal(response.status,503);assert(!(await response.text()).includes('Private DB'));error=null;data=sample;renderFails=true;assert.equal((await request()).status,503);

let rpcCalls=0,emailData=sample,emailError=null;
const prepare=new Function('createAdminClient','renderEventTicketPdf','ticketFilename','ticketConfirmationBody','ticketConfirmationContent',`${compile(read('lib/notifications/ticket-attachment.ts'))};return prepareTicketEmail;`)(()=>({rpc:async(name,args)=>{rpcCalls++;assert.equal(name,'get_event_ticket_email');assert.deepEqual(args,{p_job_id:'job'});return {data:emailData,error:emailError};}}),async()=>bytes,ticketFilename,ticketConfirmationBody,ticketConfirmationContent);
const job={job_id:'job',to_email:'consenting@example.invalid',template_key:'registration',dedupe_key:'order-status:11111111-2222-4333-8444-555555555555:fulfilled',payload:{title:'Your event place is confirmed',body:'Your place is confirmed.',href:'/orders/reference'}};
assert.equal(await prepare({...job,dedupe_key:'order-status:x:pending_review'}),null);assert.equal(rpcCalls,0);
let attachment=await prepare(job);assert.equal(attachment.attachment.content_type,'application/pdf');assert.deepEqual(Buffer.from(attachment.attachment.content,'base64'),Buffer.from(bytes));
emailData={not_event:true};assert.equal(await prepare(job),null,'course/membership commerce remains unchanged');
emailData=null;await assert.rejects(prepare(job),e=>e.code==='TICKET_NO_LONGER_VALID');emailError={code:'offline'};await assert.rejects(prepare(job),/ticket_attachment_unavailable/);emailError=null;emailData=sample;
let payload,providerCalls=0;
const {renderBrandedEmail}=new Function(`${compile(read('lib/notifications/template.ts'))};return {renderBrandedEmail};`)();
const sender=new Function('renderBrandedEmail','prepareTicketEmail','process','fetch',`${compile(read('lib/notifications/email.ts'))};return sendNotificationEmail;`)(renderBrandedEmail,prepare,{env:{RESEND_API_KEY:'mock',EMAIL_FROM:'team@example.invalid',NEXT_PUBLIC_SITE_URL:'https://www.herafricatable.com'}},async(url,options)=>{providerCalls++;payload=JSON.parse(options.body);assert.equal(options.headers['idempotency-key'],'job');return {ok:true,json:async()=>({id:'mock'})};});
await sender(job);assert.equal(payload.attachments.length,1);assert.equal(payload.attachments[0].content,attachment.attachment.content);assert(payload.text.includes('/events/sample-event/pass'));assert(payload.html.includes('View my ticket'));assert(!payload.html.includes(sample.qr_payload),'QR secret is attached only, never included in HTML/link');
for(const value of ['Hello Amina','Thank you for registering','Geco Cafe','Seina N.','18:30','15 minutes before'])assert(payload.text.includes(value),value);
assert(!ticketConfirmationBody({...sample,networking:null,arrival_info:''}).includes('Networking:'),'do not invent a networking time');
emailData=null;await assert.rejects(sender(job));assert.equal(providerCalls,1,'revoked ticket never reaches provider');

const styles=new Proxy({},{get:(_,key)=>key});let listRows=[{event_slug:'sample-event',event_title:'A <private> event',starts_at:sample.starts_at,ends_at:sample.ends_at,timezone:'Africa/Nairobi',status:'confirmed'}],listError=null;
const Page=new Function('React','Link','MemberHeader','createClient','redirect','styles',`${compile(read('app/profile/tickets/page.tsx'))};return MyTickets;`)(React,({href,children,...props})=>React.createElement('a',{href,...props},children),()=>null,async()=>({auth:{getUser:async()=>({data:{user:{id:'member'}}})},rpc:async(name,args)=>{assert.equal(name,'list_my_event_tickets');return {data:listRows,error:listError};}}),()=>{throw Error('redirect');},styles);
let html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));assert(html.includes('A &lt;private&gt; event'));assert(html.includes('Download PDF'));assert(!html.includes(sample.manual_code),'profile list does not expose credentials');
listRows=[];html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));assert(html.includes('No confirmed tickets yet'));
listError={code:'offline'};html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));assert(html.includes('Your tickets could not load'));assert(!html.includes('No confirmed tickets yet'));
if(process.argv.includes('--preview')){mkdirSync('output/pdf',{recursive:true});writeFileSync('output/pdf/her-africa-table-sample-ticket.pdf',bytes);mkdirSync('tmp',{recursive:true});const content=ticketConfirmationContent(sample);writeFileSync('tmp/ticket-confirmation-sample.html',renderBrandedEmail({title:'Your ticket for Founders at the Table - SAMPLE',...content,href:'https://www.herafricatable.com/profile/tickets',buttonLabel:'View my ticket',preferenceNote:'Example email only. No real booking or delivery.'}));}
const live=read('scripts/accept-event-ticket-live.mjs');for(const guard of ['HAT_CONFIRM_TICKET_REHEARSAL','profile.data.is_test_account',"audience:'community'","registration_mode:'closed'",'subtotal_minor:0,total_minor:0',"'manage_event_lifecycle'","scope:'local'",'emails_sent:0'])assert(live.includes(guard));assert(!live.includes('.auth.admin.')&&!live.includes('api.resend.com'),'live acceptance cannot reset accounts or send real provider mail');
console.log('Ticket PDF generation/determinism, own-account route, private headers, email attachment/revocation, unchanged non-event commerce and profile states passed. No real emails sent.');
