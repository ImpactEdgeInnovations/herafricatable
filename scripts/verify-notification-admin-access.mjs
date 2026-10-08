import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
async function harness(path,name,names){
 const source=read(path).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 const code=ts.transpileModule(`export function harness(context){const {${names.join(',')}}=context;${source};return ${name};}`,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).harness;
}
const NextResponse={json:(body,options={})=>new Response(JSON.stringify(body),{status:options.status??200,headers:{'content-type':'application/json'}})};
const request=(body='',origin)=>new Request('https://www.herafricatable.com/api/admin/notifications/process',{method:'POST',headers:origin?{origin}:{},body});
const accessHarness=await harness('lib/notifications/admin-access.ts','requireNotificationAdmin',['NextResponse','createClient']);
for(const [options,status] of [[{},200],[{user:null},401],[{allowed:false},403],[{allowed:null},403],[{error:{message:'unavailable'}},503],[{throws:true},503],[{origin:'https://unrelated.example'},403]]){
 const calls=[];
 const run=accessHarness({NextResponse,createClient:async()=>({auth:{getUser:async()=>({data:{user:Object.hasOwn(options,'user')?options.user:{id:'admin',email:'admin@example.invalid'}},error:null})},rpc:async(name,args)=>{calls.push({name,args});if(options.throws)throw Error('offline');return {data:Object.hasOwn(options,'allowed')?options.allowed:true,error:options.error??null};}})});
 const result=await run(request('',options.origin));assert.equal(result.response?.status??200,status);
 if(calls.length)assert.deepEqual(calls[0],{name:'is_admin',args:{check_roles:['super_admin']}});
 if(options.origin)assert.equal(calls.length,0);
}
const processHarness=await harness('app/api/admin/notifications/process/route.ts','POST',['NextResponse','requireNotificationAdmin','processNotificationQueue']);
for(const [body,status,target] of [['',200,undefined],['{}',200,undefined],['broken json',400],['null',400],['[]',400],['{"dedupeKey":"bad"}',400],['{"dedupeKey":42}',400],['{"dedupeKey":"table-invitation:------------------------------------"}',400],['{"dedupeKey":"table-invitation:11111111-2222-3333-4444-555555555555"}',200,'table-invitation:11111111-2222-3333-4444-555555555555']]){
 const calls=[];const run=processHarness({NextResponse,requireNotificationAdmin:async()=>({user:{id:'admin'},response:null}),processNotificationQueue:async args=>{calls.push(args);return NextResponse.json({ok:true});}});
 assert.equal((await run(request(body))).status,status);
 assert.equal(calls.length,status===200?1:0);
 if(status===200)assert.deepEqual(calls[0],{dedupeKey:target,strictTarget:Boolean(target)});
}
let calls=0;const denied=processHarness({NextResponse,requireNotificationAdmin:async()=>({user:null,response:NextResponse.json({}, {status:403})}),processNotificationQueue:async()=>{calls++;}});
assert.equal((await denied(request())).status,403);assert.equal(calls,0);
const testHarness=await harness('app/api/admin/notifications/test/route.ts','POST',['NextResponse','requireNotificationAdmin','createAdminClient','sendNotificationEmail','randomUUID']);
for(const [options,status,sends] of [[{cooldownError:true},503,0],[{count:1},429,0],[{},200,1],[{denied:true},403,0]]){
 let sent=0;const query={select(){return this;},eq(){return this;},in(){return this;},gte:async()=>({count:options.count??0,error:options.cooldownError?Error('offline'):null}),insert:async()=>({error:null})};
 const run=testHarness({NextResponse,requireNotificationAdmin:async()=>options.denied?{user:null,response:NextResponse.json({}, {status:403})}:{user:{id:'admin',email:'admin@example.invalid'},response:null},createAdminClient:()=>({from:()=>query}),sendNotificationEmail:async job=>{assert.equal(job.to_email,'admin@example.invalid');sent++;return 'mock-provider-id';},randomUUID:()=> 'test-only-id'});
 assert.equal((await run(request())).status,status);assert.equal(sent,sends);
}
assert(read('lib/notifications/worker.ts').includes('dedupeKey && !strictTarget'));
console.log('Notification Admin behavior passed: current-role checks, denied/expired-role result, cross-origin and failed authorization, cooldown failure, malformed targets and strict single-job delivery. No real email sent.');
