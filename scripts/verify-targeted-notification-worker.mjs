import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/notifications/worker.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const code=ts.transpileModule(`export function harness(context){const {NextResponse,createAdminClient,sendNotificationEmail}=context;${source};return processNotificationQueue;}`,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {harness}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const NextResponse={json:(body,options={})=>new Response(JSON.stringify(body),{status:options.status??200})};
const key='table-invitation:11111111-2222-3333-4444-555555555555';
const job={job_id:'job',to_email:'recipient@mock.test',template_key:'table_invitation',payload:{title:'Synthetic'},attempt_number:1,dedupe_key:key};
const oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.EMAIL_FROM;
process.env.RESEND_API_KEY='mock-only';process.env.EMAIL_FROM='mock@mock.test';
try {
 for(const mode of ['sent','missing_claim','no_job','unscoped','batch']){
  const calls=[];let sends=0;
  const run=harness({NextResponse,createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});
   if(name==='claim_notification_job')return mode==='missing_claim'?{data:null,error:{code:'PGRST202'}}:{data:mode==='no_job'?[]:[job],error:null};
   if(name==='claim_notification_jobs')return {data:[],error:null};
   if(name==='finish_notification_job')return {error:null};
   if(mode!=='batch')throw Error('Unrelated lifecycle/briefing queue must not run');
   return {data:name==='reconcile_community_host_subscriptions'?[]:0,error:null};
  }}),sendNotificationEmail:async claimed=>{assert.equal(claimed.dedupe_key,key);sends++;return 'mock-provider';}});
  const response=await run(mode==='batch'?{}:{dedupeKey:key,...(mode==='unscoped'?{strictTarget:false}:{})});
  assert.equal(response.status,mode==='missing_claim'?503:mode==='unscoped'?400:200);
  const result=await response.json();
  if(mode==='sent'){assert.equal(sends,1);assert.equal(result.sent,1);assert.equal(result.briefingsQueued,0);assert.deepEqual(calls.map(c=>c.name),['claim_notification_job','finish_notification_job']);}
  if(mode==='missing_claim'||mode==='no_job'){assert.equal(sends,0);assert.deepEqual(calls.map(c=>c.name),['claim_notification_job']);}
  if(mode==='unscoped'){assert.equal(sends,0);assert.equal(calls.length,0);}
  if(mode==='batch')assert.deepEqual(calls.map(c=>c.name),['reconcile_community_host_subscriptions','queue_community_weekly_briefings','queue_due_community_event_reminders','queue_due_standalone_event_reminders','claim_notification_jobs']);
 }
}finally{if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;if(oldFrom===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=oldFrom;}
console.log('Targeted delivery behavior passed: one job only, no unrelated work, no broad fallback, default strict scope and preserved batch preparation. All provider/database calls were mocked.');
