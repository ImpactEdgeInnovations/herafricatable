import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const path = 'components/community/community-photo-albums.tsx';
const source = read(path);
function compileFunction(text, name, context) {
  const code = ts.transpileModule(text, {compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,module:ts.ModuleKind.None}}).outputText;
  return new Function(...Object.keys(context), `${code};return ${name};`)(...Object.values(context));
}
function handler(name, context, text=source) {
  const tree=ts.createSourceFile('test.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(tree);ts.forEachChild(node,visit);}visit(tree);assert(found, name);
  return compileFunction(found,name,context);
}
const initial={album:{id:'album',cover_photo_id:'a'},photos:[{id:'a',status:'published',caption:'A'}],can_manage:true,can_upload:true,has_more:true,next_cursor:'a'};
function context(mode='ok') {
  let details=structuredClone(initial),list={albums:[]},selected='a';const calls=[],messages=[],busy=[];let release;
  const ctx={details,busy:'',requestVersion:{current:1},moreRequest:{current:null},loadedCount:{current:24},coverSaving:{current:false},
    setDetails(next){details=typeof next==='function'?next(details):next;},setList(next){list=next;},setSelectedPhoto(next){selected=next;},setBusy:next=>busy.push(next),setMessage:next=>messages.push(next),
    memberErrorMessage:()=> 'Try again.',refresh:async()=>{},
    supabase:{rpc:async(name,args)=>{calls.push({name,args});if(mode==='hold'&&calls.length===1)return new Promise(resolve=>{release=resolve;});if(mode==='throw')throw Error('offline');if(mode==='denied')return {error:{code:'42501',message:'unavailable'}};if(mode==='error')return {error:Error('offline')};if(mode==='refresh-failed'&&calls.length>1)return {error:Error('offline')};return {data:name==='save_community_album_cover'?'b':{...initial,photos:[{id:'a',status:'published',caption:'Updated A'},{id:'b',status:'published'}],has_more:false,next_cursor:null},error:null};}}};
  return {ctx,calls,messages,busy,details:()=>details,list:()=>list,selected:()=>selected,release:()=>release({data:{...initial,photos:[{id:'b',status:'published'}],has_more:false},error:null})};
}
for(const mode of ['ok','error','throw','denied','hold','stale']){
  const test=context(mode==='stale'?'hold':mode);const more=handler('loadMore',test.ctx);const pending=more();
  if(['hold','stale'].includes(mode)){await more();assert.equal(test.calls.length,1,'synchronous page lock');if(mode==='stale')test.ctx.requestVersion.current++;test.release();}
  await pending;
  assert.deepEqual(test.calls[0],{name:'get_community_photo_album_page',args:{p_album_id:'album',p_after:'a',p_limit:24}});
  if(['ok','hold'].includes(mode)){assert.deepEqual(test.details().photos.map(p=>p.id),['a','b']);assert.equal(test.details().has_more,false);}
  if(['error','throw'].includes(mode)){assert.equal(test.details().photos.length,1);assert.equal(test.messages.at(-1),'Try again.');}
  if(mode==='denied'){assert.equal(test.details(),null);assert.equal(test.list(),null);assert.equal(test.selected(),'');}
  if(mode==='stale')assert.equal(test.details().photos.length,1,'late page must not replace new album');
  else assert.equal(test.busy.at(-1),'');
}
for(const mode of ['ok','error','throw','refresh-failed','hold']){
  const test=context(mode);const save=handler('saveCover',test.ctx);const pending=save('b');
  if(mode==='hold'){await save('b');assert.equal(test.calls.length,1,'synchronous cover lock');test.release();}
  await pending;
  assert.deepEqual(test.calls[0],{name:'save_community_album_cover',args:{p_album_id:'album',p_photo_id:'b'}});
  assert.equal(test.ctx.coverSaving.current,false);assert.equal(test.busy.at(-1),'');
  if(mode==='refresh-failed')assert.match(test.messages.at(-1),/cover saved.*refresh/);
  if(['error','throw'].includes(mode))assert.equal(test.messages.at(-1),'Try again.');
}
const nonHost=context();nonHost.ctx.details={...initial,can_manage:false};await handler('saveCover',nonHost.ctx)('b');assert.equal(nonHost.calls.length,0);

// Execute the background read with a page arriving after the loaded window grows.
const background=source.slice(source.indexOf('    async function recheck()'),source.indexOf('    const timer',source.indexOf('    async function recheck()')));
let releaseBackground, replaced=false;
const backgroundContext={stopped:false,checking:false,loadedCount:{current:24},moreRequest:{current:null},selectedAlbumId:'album',supabase:{rpc:()=>new Promise(resolve=>{releaseBackground=resolve;})},setDetails:()=>{replaced=true;},setList(){},setFiles(){},setSelectedPhoto(){},setMessage(){}};
const refresh=compileFunction(background,'recheck',backgroundContext);const refreshing=refresh();backgroundContext.loadedCount.current=48;releaseBackground({data:initial,error:null});await refreshing;assert.equal(replaced,false,'old 24-photo refresh must not discard a newly loaded page');

const React={Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)})};
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of node.children??[]){const match=find(child,predicate);if(match)return match;}return null;}
const cardText=read('components/community/community-album-card.tsx').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
let failedCover=null,opened=0;
const Card=compileFunction(cardText,'CommunityAlbumCard',{React,useState:()=>[failedCover,value=>{failedCover=value;}]});
const props={album:{id:'album',title:'Our meetup',gathering_title:'Coffee meetup',photo_count:2,cover_photo_id:'photo-a'},selected:false,disabled:false,onOpen:()=>{opened++;}};
let card=Card(props);assert.equal(find(card,n=>n.type==='img').props.src,'/api/community/photos/photo-a');card.props.onClick();assert.equal(opened,1);find(card,n=>n.type==='img').props.onError();assert(!find(Card(props),n=>n.type==='img'));assert(find(Card({...props,album:{...props.album,cover_photo_id:'photo-b'}}),n=>n.type==='img'));assert.equal(Card({...props,disabled:true}).props.disabled,true);

const viewer=read('components/community/community-photo-viewer.tsx');
let pageRequests=0,releaseNext;const nextRequested={current:false};
const move=handler('move',{loadingMore:false,nextRequested,photos:[{id:'a'}],index:0,hasMore:true,onSelect(){},onLoadMore:()=>{pageRequests++;return new Promise(resolve=>{releaseNext=resolve;});}},viewer);
const moving=move(1);await move(1);assert.equal(pageRequests,1);releaseNext(true);await moving;
const viewerTree=ts.createSourceFile('viewer.tsx',viewer,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(viewerTree)==='useEffect'&&node.arguments[0]?.getText(viewerTree).includes('nextRequested.current'))effect=node.arguments[0].getText(viewerTree);ts.forEachChild(node,visit);}visit(viewerTree);assert(effect);
const effectCode=ts.transpileModule(`const check=${effect};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
let selected;
new Function('photos','index','loadingMore','nextRequested','onSelect',`${effectCode};check();`)([{id:'a'},{id:'b'}],0,false,nextRequested,id=>{selected=id;});assert.equal(selected,'b');assert.equal(nextRequested.current,false);
nextRequested.current=true;new Function('photos','index','loadingMore','nextRequested','onSelect',`${effectCode};check();`)([{id:'a'}],0,false,nextRequested,()=>{});assert.equal(nextRequested.current,false,'a page containing only moderation records must not trap carousel navigation');
console.log('Album cover/paging L1 passed: actual RPC handlers, duplicate/stale/failure recovery, scoped visual cards, larger-window refresh protection and carousel page boundaries. Services mocked; browser/file acceptance separate.');
