import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createPosterRecovery} from '../lib/events/poster-recovery.ts';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const compile=source=>ts.transpileModule(source.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
let clock=0, changes=0;
const source='/api/events/123/poster';
const recovery=createPosterRecovery(source,()=>changes++,()=>clock);
assert.equal(recovery.read().url,source);
recovery.error(source);const second=recovery.read().url;
assert.notEqual(second,source);assert.equal(recovery.read().attempt,1);
recovery.error(source);assert.equal(recovery.read().url,second,'Stale events ignored');
recovery.error(second);assert.equal(recovery.read().failed,true);
recovery.error(second);assert.equal(changes,2,'No automatic retry loop');
recovery.retry();assert.equal(recovery.read().attempt,2);assert.equal(recovery.read().failed,false);
recovery.retry();assert.equal(recovery.read().attempt,2,'Double click cannot start parallel retries');
const third=recovery.read().url;recovery.timeout(third);assert(recovery.read().failed);
recovery.resume();assert.equal(recovery.read().attempt,2,'Failed resume is throttled');
clock=30_001;recovery.resume();assert.equal(recovery.read().attempt,3);
clock+=44*60_000;recovery.resume();assert.equal(recovery.read().attempt,3);
clock+=60_001;recovery.resume();assert.equal(recovery.read().attempt,4,'Old links renew on resume');
const empty=createPosterRecovery(null,()=>assert.fail('Empty image made a request'));empty.retry();empty.resume();empty.error('');

// Execute the actual hook with controlled lifecycle/browser dependencies.
const listeners=new Map(),timers=new Map();let n=0,memo,states=[],cursor=0,effects=[];
const doc={visibilityState:'hidden',addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event)};
const win={addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event),setTimeout:fn=>{timers.set(++n,fn);return n;},clearTimeout:id=>timers.delete(id)};
const Hook=new Function('useEffect','useMemo','useState','createPosterRecovery','window','document','navigator',`${compile(read('components/events/use-event-poster.ts'))};return useEventPoster;`)(fn=>effects.push(fn),fn=>memo??=fn(),initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},(s,c)=>createPosterRecovery(s,c,()=>clock),win,doc,{onLine:true});
const render=()=>{cursor=0;effects=[];return Hook(source);};
let hook=render();const cleanups=effects.map(fn=>fn());
assert.deepEqual([...listeners.keys()].sort(),['online','pageshow','visibilitychange']);
clock+=46*60_000;listeners.get('pageshow')();assert.equal(render().attempt,0,'Hidden document must not refresh');
doc.visibilityState='visible';listeners.get('visibilitychange')();hook=render();assert.equal(hook.attempt,1);
const retryEffects=effects.map(fn=>fn());assert(timers.size>0);hook.onLoad();assert.equal(render().failed,false);
for(const fn of [...cleanups,...retryEffects])fn?.();assert.equal(listeners.size,0);assert.equal(timers.size,0);

// Execute the actual route; no database/service key or caller-supplied path.
const id='ad68e361-640d-4c13-9e2b-0aa8179d56c6';
for(const mode of ['public','community-member','denied','access-error','missing','cover','cover-fails','sign-error','throw']){
  const calls=[];let created=0;
  const client={rpc:async(name,args)=>{calls.push({name,args});if(mode==='throw')throw Error('network');
    if(name==='can_view_event')return {data:mode!=='denied',error:mode==='access-error'?Error('offline'):null};
    if(name==='list_public_event_host_covers')return {data:['cover','cover-fails'].includes(mode)?[{storage_path:'approved-cover'}]:[],error:null};
    return {data:mode==='missing'?[]:[{storage_path:'approved-poster'}],error:null};
  },storage:{from:bucket=>({createSignedUrl:async(path,ttl)=>{calls.push({bucket,path,ttl});return {data:{signedUrl:'https://example.supabase.co/signed'},error:mode==='sign-error'||(mode==='cover-fails'&&bucket==='event-host-covers')?Error('denied'):null};}})}};
  const GET=new Function('createClient',`${compile(read('app/api/events/[eventId]/poster/route.ts'))};return GET;`)(async()=>{created++;return client;});
  const invalid=await GET(new Request('https://hat.test/api'),{params:Promise.resolve({eventId:'../private-file'})});assert.equal(invalid.status,404);assert.equal(created,0);
  const result=await GET(new Request('https://hat.test/api?path=private&bucket=private'),{params:Promise.resolve({eventId:id})});
  assert.match(result.headers.get('Cache-Control'),/private, no-store/);assert.equal(result.headers.get('Vary'),'Cookie');
  assert.equal(result.status,['denied','missing'].includes(mode)?404:['access-error','sign-error','throw'].includes(mode)?503:307,mode);
  if(mode==='denied')assert.equal(calls.length,1,'Denied viewer must not look up or sign files');
  const signs=calls.filter(x=>x.bucket);for(const sign of signs){assert.equal(sign.ttl,3600);assert(['approved-cover','approved-poster'].includes(sign.path));}
  if(mode==='cover')assert.equal(signs[0].bucket,'event-host-covers');
  if(mode==='cover-fails')assert.equal(signs[1].bucket,'proposal-media');
}
const hookSource=read('components/events/use-event-poster.ts');assert(hookSource.includes('navigator.onLine'));assert(hookSource.includes('20_000'));
const route=read('app/api/events/[eventId]/poster/route.ts');assert(!route.includes('createAdminClient'));assert(!route.includes('getPublicUrl'));
assert(read('app/events/page.tsx').includes('`/api/events/${poster.event_id}/poster`'));
assert(read('app/events/[slug]/page.tsx').includes('<EventPosterImage'));
console.log('PASS: bounded/stale-safe retries, manual retry, resume throttle, timeout/cleanup and actual route visibility/signing/failure contracts. Physical installed-PWA acceptance remains separate.');
