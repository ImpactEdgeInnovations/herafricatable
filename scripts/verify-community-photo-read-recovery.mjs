import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../components/community/community-photo-albums.tsx',import.meta.url),'utf8');
function compile(start,end,name,context) {
  const text=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  const code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(context),`${code};return ${name};`)(...Object.values(context));
}
function context(rpc) {
  const state={busy:[],messages:[],details:[],files:[]};
  return {...state,requestVersion:{current:0},unsavedFiles:false,ask:async()=>true,
    setFiles:v=>state.files.push(v),setBatchId:()=>{},setCaption:()=>{},setPermission:()=>{},setSelectedPhoto:()=>{},setShowDiscussion:()=>{},
    setDetails:v=>state.details.push(v),setBusy:v=>state.busy.push(v),setMessage:v=>state.messages.push(v),
    supabase:{rpc},memberErrorMessage:()=> 'Please try opening this album again.'};
}
const album={album:{id:'one',contribution_mode:'hosts_only',is_closed:true},photos:[],can_manage:false,can_upload:false};
for(const outcome of ['success','returned','throw','empty']) {
  const ctx=context(async(name,args)=>{assert.equal(name,'get_community_photo_album');assert.deepEqual(args,{p_album_id:'one'});if(outcome==='throw')throw Error('Offline');return {data:outcome==='empty'?null:album,error:outcome==='returned'?Error('Denied'):null};});
  await compile('  async function select(', '  async function create(', 'select',ctx)('one');
  assert.equal(ctx.busy.at(-1),'');
  assert.equal(ctx.details.at(-1),outcome==='success'?album:null);
  if(outcome!=='success')assert.equal(ctx.messages.at(-1),'Please try opening this album again.');
}
// A late response may never replace the currently selected album or clear its busy state.
let release;
const ctx=context(()=>new Promise(resolve=>release=resolve));
const select=compile('  async function select(', '  async function create(', 'select',ctx);
const pending=select('one');ctx.requestVersion.current++;release({data:album,error:null});await pending;
assert.deepEqual(ctx.details,[null]);assert.equal(ctx.busy.at(-1),'album');
const declined=context(async()=>{throw Error('Must not read');});declined.unsavedFiles=true;declined.ask=async()=>false;
await compile('  async function select(', '  async function create(', 'select',declined)('one');assert.deepEqual(declined.busy,[]);assert.deepEqual(declined.files,[]);

// Exercise both background readers, including thrown fetches and stopped effects.
for(const kind of ['list','album'])for(const outcome of ['success','returned','throw','empty','stopped']) {
  let details={...album,can_manage:true,can_upload:true};let list={albums:[]};const messages=[];let calls=0;
  const background={stopped:outcome==='stopped',checking:false,communityId:'community-one',selectedAlbumId:'one',requestVersion:{current:0},
    supabase:{rpc:async()=>{calls++;if(outcome==='throw')throw Error('Offline');return {data:outcome==='empty'?null:kind==='list'?{albums:[]}:album,error:outcome==='returned'?Error('Denied'):null};}},
    setList:value=>list=value,setDetails:value=>details=typeof value==='function'?value(details):value,setFiles:()=>{},setSelectedPhoto:()=>{},setBusy:()=>{},setMessage:value=>messages.push(value)};
  const start=kind==='list'?'    async function recheckList()':'    async function recheck()';
  const read=compile(start,'    const timer',kind==='list'?'recheckList':'recheck',background);
  await read();assert.equal(calls,1);
  if(outcome==='stopped'){assert.equal(messages.length,0);assert.equal(details.can_manage,true);assert.notEqual(list,null);}
  else if(outcome==='success'){assert.equal(messages.length,0);if(kind==='album')assert.equal(details,album,'Refresh all album settings and current Host permissions');}
  else {assert.equal(details,null);assert.equal(list,null);assert.equal(messages.length,1);}
}
for(const kind of ['list','album']) {
  let release;let calls=0;
  const background={stopped:false,checking:false,communityId:'community-one',selectedAlbumId:'one',requestVersion:{current:0},supabase:{rpc:()=>{calls++;return new Promise(done=>release=done);}},setList:()=>{},setDetails:()=>{},setFiles:()=>{},setSelectedPhoto:()=>{},setBusy:()=>{},setMessage:()=>{}};
  const read=compile(kind==='list'?'    async function recheckList()':'    async function recheck()','    const timer',kind==='list'?'recheckList':'recheck',background);
  const pending=read();await read();assert.equal(calls,1,'Focus and timer checks must not overlap');release({data:kind==='list'?{albums:[]}:album,error:null});await pending;
}
console.log('Photo read recovery passed: thrown/denied/empty reads, late album responses, cancelled selection and refreshed album permissions. Real-file and browser acceptance remain separate.');

const discussion=readFileSync(new URL('../components/member/community-gathering-discussion.tsx',import.meta.url),'utf8');
for(const outcome of ['success','empty','denied','throw'])for(const albumId of [undefined,'album-one']) {
  const states={};const calls=[];
  const context={running:false,active:true,albumId,roomId:'room-one',cursor:null,
    supabase:{rpc:async(name,args)=>{calls.push([name,args]);if(outcome==='throw')throw Error('Offline');return {data:outcome==='empty'?null:{comments:[]},error:outcome==='denied'?Error('Denied'):null};}},
    setItem:v=>states.item=v,setNotStarted:v=>states.notStarted=v,setError:v=>states.error=v,setLoading:v=>states.loading=v,memberErrorMessage:()=> 'Please try opening this conversation again.'};
  const code=ts.transpileModule(discussion.slice(discussion.indexOf('    async function load()'),discussion.indexOf('    setItem(null); setNotStarted(false); setLoading(true);')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  await new Function(...Object.keys(context),`${code};return load;`)(...Object.values(context))();
  assert.equal(states.loading,false);assert.equal(calls[0][0],albumId?'get_community_album_discussion':'get_community_gathering_discussion');
  const optionalEmpty=outcome==='empty'&&!albumId;
  assert.equal(states.error,outcome==='success'||optionalEmpty?'':'Please try opening this conversation again.');
  assert.equal(states.notStarted,optionalEmpty);
  if(outcome!=='success')assert.equal(states.item,null);
}
assert(discussion.includes('notStarted ? <p') && discussion.includes('The Host hasn’t opened a separate discussion here'));
console.log('Gathering optional-discussion empty state is distinct from denied/thrown reads; album failures retain retry and no empty response enables posting.');
