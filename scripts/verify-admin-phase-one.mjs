import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
async function harness(path,name,names){const source=read(path).replace(/^import .*;\n/gm,'').replace(/^export \{.*\} from .*;\n/gm,'').replace(/^export /gm,'');const code=ts.transpileModule(`export function harness(context){const {${names.join(',')}}=context;${source};return ${name};}`,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return(await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).harness;}
const NextResponse={json:(body,options={})=>new Response(JSON.stringify(body),{status:options.status??200})};
const req=()=>new Request('https://www.herafricatable.com/api/admin/privacy/delete',{method:'POST',body:JSON.stringify({requestId:'11111111-2222-4333-8444-555555555555'})});
const privacy=await harness('app/api/admin/privacy/delete/route.ts','POST',['NextResponse','createClient','createAdminClient','requireSuperAdmin','adminErrorMessage']);
for(const mode of ['denied','auth_failed','avatar_failed','checkpoint_failed','resume','complete','throws']){
 const calls=[];const state={status:'processing',auth_disabled_at:mode==='resume'?'saved':null,avatar_removed_at:null};
 const run=privacy({NextResponse,requireSuperAdmin:async()=>mode==='denied'?{response:NextResponse.json({}, {status:403})}:{response:null,user:{id:'admin'}},adminErrorMessage:()=> 'Safe error',
 createClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});if(mode==='throws')throw Error('offline');if(name==='execute_account_deletion')return{data:'target',error:null};return{error:mode==='checkpoint_failed'?Error('offline'):null};},from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:state,error:null})})}),
 createAdminClient:()=>({auth:{admin:{updateUserById:async()=>{calls.push({name:'auth'});return{error:mode==='auth_failed'?Error('failed'):null};}}},storage:{from:()=>({remove:async()=>{calls.push({name:'avatar'});return{error:mode==='avatar_failed'?Error('failed'):null};}})}})});
 const response=await run(req());assert.equal(response.status,mode==='denied'?403:['complete','resume'].includes(mode)?200:503);
 if(mode==='denied')assert.equal(calls.length,0);
 if(mode==='auth_failed')assert(!calls.some(c=>c.name==='avatar'));
 if(mode==='avatar_failed')assert(calls.some(c=>c.name==='record_account_cleanup_step'&&c.args.p_step==='auth'&&c.args.p_success));
 if(mode==='resume')assert(!calls.some(c=>c.name==='auth'),'saved auth checkpoint must be reused');
 if(mode==='checkpoint_failed')assert(!calls.some(c=>c.name==='avatar'),'do not advance after unrecorded outcome');
}
const roles=await harness('lib/admin-access.ts','getActiveAdminRole',[]);
for(const mode of ['allowed','expired','error','throws']){const resolve=roles({});const result=await resolve({rpc:async()=>{if(mode==='throws')throw Error('offline');return{data:mode==='expired'?null:'super_admin',error:mode==='error'?Error('offline'):null};}},['super_admin']);assert.equal(result.data?.role??null,mode==='allowed'?'super_admin':null);}
for(const path of ['app/api/admin/table-guide/test/route.ts','app/api/admin/test-users/route.ts']){
 const runFactory=await harness(path,'POST',['NextResponse','requireSuperAdmin','createClient','createAdminClient']);let used=false;
 const run=runFactory({NextResponse,requireSuperAdmin:async()=>({response:NextResponse.json({}, {status:403})}),createClient:()=>{used=true;throw Error('forbidden');},createAdminClient:()=>{used=true;throw Error('forbidden');}});
 assert.equal((await run(req())).status,403);assert.equal(used,false);
}
const ai=await harness('app/api/admin/table-guide/test/route.ts','POST',['NextResponse','requireSuperAdmin','createAdminClient','fetch']);
const previous={key:process.env.OPENAI_API_KEY,salt:process.env.AI_SAFETY_SALT};process.env.OPENAI_API_KEY='mock';process.env.AI_SAFETY_SALT='mock';
try{let fetched=false;const query={select(){return this;},eq(){return this;},in(){return this;},gte:async()=>({count:null,error:Error('offline')})};const run=ai({NextResponse,requireSuperAdmin:async()=>({response:null,user:{id:'admin'}}),createAdminClient:()=>({from:()=>query}),fetch:()=>{fetched=true;throw Error('forbidden');}});assert.equal((await run(req())).status,503);assert.equal(fetched,false);}finally{if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key;if(previous.salt===undefined)delete process.env.AI_SAFETY_SALT;else process.env.AI_SAFETY_SALT=previous.salt;}
console.log('L1 Admin phase one passed: fail-closed active-role checks, denied provider/test-user calls, failed cooldown, staged cleanup failure/checkpoint/retry and thrown-request handling. External services mocked.');
