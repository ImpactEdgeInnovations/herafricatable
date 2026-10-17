import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
function handler(path,context){
  const tree=ts.createSourceFile('test.tsx',read(path),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='join')fn=node.getText(tree);ts.forEachChild(node,visit);}visit(tree);assert(fn);
  return new Function(...Object.keys(context),`${compile(fn)};return join;`)(...Object.values(context));
}
for(const area of ['directory','about','event'])for(const mode of ['note','blank','cancel','failure','throw','hold','open','invited','waitlist']){
  const path=area==='directory'?'components/member/community-directory.tsx':area==='about'?'components/community/community-about-action.tsx':'components/events/event-community-join.tsx';
  const calls=[],prompts=[],busy=[],messages=[],cleared=[];let release;
  const item={community_id:'community',name:'Test group',effective_mode:mode==='open'?'open':'approval',membership_status:mode==='invited'?'invited':null,is_full:mode==='waitlist',waiting_list_enabled:true};
  const api={rpc:async(name,args)=>{calls.push({name,args});if(mode==='throw')throw Error('offline');return {data:mode==='waitlist'?'waitlisted':mode==='open'?'active':'requested',error:mode==='failure'?Error('failed'):null};},auth:{getUser:async()=>({data:{user:{id:'member'}}})},from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{status:'requested'},error:null})})})})})};
  const context={busy:area==='directory'?'':false,joining:{current:false},joinLimitsReady:true,setBusy:value=>busy.push(value),setMessage:value=>messages.push(value),supabase:api,client:api,communityId:'community',joiningMode:item.effective_mode,joinPolicy:item.effective_mode,status:item.membership_status,slug:'test',router:{refresh(){},push(){}},setStatus(){},memberErrorMessage:()=> 'Try again.',clearDraft:key=>cleared.push(key),ask:async options=>{prompts.push(options);if(mode==='hold')return new Promise(resolve=>{release=resolve;});return mode==='cancel'?null:{message:mode==='blank'?'   ':'  Hello Host.  '};}};
  const join=handler(path,context);const pending=join(item);
  if(mode==='hold'){await join(item);assert.equal(prompts.length,1,'synchronous duplicate prompt guard');release({message:'Hello Host.'});}
  await pending;
  if(mode==='cancel'){assert.equal(calls.length,0);assert.equal(cleared.length,0);}
  else {
    assert.equal(calls[0].name,'join_community_with_message');assert.equal(calls[0].args.p_community_id,'community');
    const expectsPrompt=mode!=='open'&&!(mode==='invited'&&area!=='about');
    assert.equal(prompts.length,expectsPrompt?1:0);
    assert.equal(calls[0].args.p_message,mode==='blank'||!expectsPrompt?null:'Hello Host.');
    if(prompts.length){assert.equal(prompts[0].fields[0].maxLength,500);assert(!prompts[0].fields[0].required);assert.match(prompts[0].description,/private/);}
    assert.equal(cleared.length,['failure','throw'].includes(mode)?0:1,'failed submission retains the in-memory note');
    if(['failure','throw'].includes(mode))assert.equal(messages.at(-1),'Try again.');
    if(mode==='waitlist')assert(messages.some(message=>message.includes('waiting list')));
  }
  assert.equal(context.joining.current,false);assert.equal(busy.at(-1),area==='directory'?'':false);
}

const noteSource=read('components/community/community-request-note.tsx').replace(/^export /gm,'');
const Note=new Function('React',`${compile(noteSource)};return CommunityRequestNote;`)(React);
const note=renderToStaticMarkup(React.createElement(Note,{message:'<script>private</script>\nHello'}));
assert(!note.includes('<script>'));assert(note.includes('&lt;script&gt;'));assert(note.includes('Message to the Host'));
assert.equal(renderToStaticMarkup(React.createElement(Note,{})),'');
assert(renderToStaticMarkup(React.createElement(Note,{unavailable:true})).includes('could not be loaded'));
const host=read('components/member/community-host-workspace.tsx');
assert(host.includes('message={member.join_message}'));assert(host.includes('Reason for declining'));
assert(host.includes('p_reason:reason'));
const migration=read('supabase/migrations/20261016135714_community_optional_join_message.sql');
assert(migration.includes('enable row level security'));assert(migration.includes('public.join_community_with_capacity(p_community_id)'));
assert(!migration.includes('enqueue_notification('),'private notes must not be included in email');
console.log('Community join-note L1 passed: all three entry handlers, optional/trimmed notes, cancellation, duplicates, error retention, waitlist outcomes and escaped Host rendering. Live role and database acceptance are separate.');
