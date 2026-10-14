import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
import ts from 'typescript';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const calendarCode=ts.transpileModule(read('lib/events/calendar-file.ts'),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {eventCalendarFile,eventGoogleCalendarUrl}=await import(`data:text/javascript;base64,${Buffer.from(calendarCode).toString('base64')}`);
const event={eventId:'one',slug:'one',title:'Women, trade; opportunity',summary:'Line one\rLine two',location:'Nairobi',startsAt:'2027-01-31T18:00:00+03:00',endsAt:'2027-01-31T20:00:00+03:00',detailsPath:'/communities/test?view=gatherings&gathering=one'};
const file=eventCalendarFile(event,'https://www.herafricatable.com');
assert(file.includes('DTSTART:20270131T150000Z'));assert(file.includes('SUMMARY:Women\\, trade\\; opportunity'));assert(file.includes('Line one\\nLine two'));assert(file.includes('TRIGGER:-PT30M'));assert(file.includes('URL:https://www.herafricatable.com/communities/test?view=gatherings&gathering=one'));
const google=new URL(eventGoogleCalendarUrl(event,'https://www.herafricatable.com'));assert.equal(google.hostname,'calendar.google.com');assert.equal(google.searchParams.get('dates'),'20270131T150000Z/20270131T170000Z');assert.equal(google.searchParams.get('text'),event.title);
assert(!eventCalendarFile({...event,detailsPath:'//outside.invalid'},'https://www.herafricatable.com').includes('outside.invalid'));

const form=read('components/events/member-event-proposal.tsx');
const issueCode=form.slice(form.indexOf('  function currentStepIssue()'),form.indexOf('  function continueForward()'));
function issue(values,step=2){return new Function('values','step',`${issueCode};return currentStepIssue();`)(values,step);}
const values={hostExperience:'I will welcome guests and help with introductions.',safetyContactName:'Test Host',safetyContactPhone:'+254700000000',accessibilityNotes:'',hostNote:''};
assert.equal(issue(values),'','Optional arrival and private notes must not block Check & open');
assert(issue({...values,hostExperience:'Short plan'}).includes('Your plan for guests'));
assert(issue({...values,safetyContactName:''}).includes('name'));
assert(issue({...values,safetyContactPhone:''}).includes('contact number'));
const optional=form.slice(form.indexOf('<summary>Add arrival or private notes'),form.indexOf('</details>',form.indexOf('<summary>Add arrival or private notes')));
assert(!/\brequired\b|minLength/.test(optional));

const route=read('app/api/cron/notifications/route.ts').replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
const routeCode=ts.transpileModule(route,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
for(const kind of ['legacy-check','vault-check','invalid','unicode-invalid','dispatch','housekeeping']) {
 const calls=[];
 const token=kind==='legacy-check'?'legacy-token':kind==='unicode-invalid'?'ñ'.repeat(12):'a'.repeat(64);
 const GET=new Function('timingSafeEqual','Buffer','NextResponse','process','createAdminClient','cleanCommunityPhotos','processNotificationQueue',`${routeCode};return GET;`)(
  timingSafeEqual,Buffer,{json:(body,options)=>({body,status:options?.status??200})},{env:{CRON_SECRET:'legacy-token',RESEND_API_KEY:'test',EMAIL_FROM:'test@example.invalid',NEXT_PUBLIC_SITE_URL:'https://www.herafricatable.com'}},
  ()=>({rpc:async()=>{calls.push('verify');return {data:kind!=='invalid',error:null};}}),async()=>calls.push('cleanup'),async()=>{calls.push('queue');return {status:200};});
 const query=kind.endsWith('check')?'?check=1':kind==='dispatch'?'?dispatch=1':'';
 const result=await GET(new Request(`https://www.herafricatable.com/api/cron/notifications${query}`,{headers:{Authorization:`Bearer ${token}`}}));
 assert.equal(result.status,['invalid','unicode-invalid'].includes(kind)?401:200);
 assert.equal(calls.includes('queue'),['dispatch','housekeeping'].includes(kind));assert.equal(calls.includes('cleanup'),kind==='housekeeping');
 if(kind.endsWith('check'))assert.equal(result.body.email_configured,true);
}
console.log('Event planning extensions passed: calendar times/private room links, escaped descriptions, optional notes, field-specific On the day validation, and authenticated dry-run/dispatcher/housekeeping boundaries.');
