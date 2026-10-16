import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import ts from 'typescript';
const source=readFileSync(new URL('../components/featured/featured-request-panel.tsx',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const settle=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
function harness(props){
 const values=[],effects=[];let cursor=0;const reads=[],writes=[];let rpc=async()=>({error:null});
 const client={from(){const read=deferred();reads.push(read);const query={select(){return this;},order(){return this;},range(){return this;},eq(){return this;},not(){return this;},then(a,b){return read.promise.then(a,b);}};return query;},rpc(name,args){writes.push({name,args});return rpc(name,args);}};
 const state=initial=>{const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return[values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];};
 const ref=initial=>{const i=cursor++;return values[i]??(values[i]={current:initial});};
 const effect=(fn,deps)=>{const i=cursor++;const previous=values[i];if(!previous||deps.some((v,n)=>v!==previous.deps[n]))effects.push(()=>{previous?.cleanup?.();values[i]={deps,cleanup:fn()};});};
 const callback=(fn,deps)=>{const i=cursor++;const previous=values[i];if(!previous||deps.some((v,n)=>v!==previous.deps[n]))values[i]={fn,deps};return values[i].fn;};
 class Fields{constructor(form){this.form=form;}get(key){return this.form.fields[key]??null;}}
 const Component=new Function('React','useEffect','useState','useRef','useCallback','createClient','memberErrorMessage','FormData',`${code};return FeaturedRequestPanel;`)(React,effect,state,ref,callback,()=>client,()=>"Please try again.",Fields);
 let tree;
 function render(){cursor=0;tree=Component(props);for(const run of effects.splice(0))run();return tree;}
 function nodes(type){const found=[];function visit(node){if(!node||typeof node!=='object')return;if(node.type===type)found.push(node);React.Children.forEach(node.props?.children,visit);}visit(tree);return found;}
 function text(){function visit(node){if(typeof node==='string'||typeof node==='number')return String(node);return React.Children.toArray(node?.props?.children).map(visit).join(' ');}return visit(tree);}
 function send(form,decision='approved'){form.props.onSubmit({preventDefault(){},currentTarget:{fields:{reason:'Please feature this event.',start:'2026-11-01T10:00',end:'2026-11-02T10:00',note:'Review note.'},reset(){}},nativeEvent:{submitter:{getAttribute:()=>decision}}});}
 return{render,nodes,text,send,reads,writes,setRpc(fn){rpc=fn;}};
}
const host=harness({kind:'event',targetId:'event'});host.render();host.reads[0].reject(new Error('offline'));await settle();host.render();
assert(host.text().includes('Requests could not load'));assert(host.nodes('button').find(n=>n.props.children==='Send request').props.disabled);
host.nodes('button').find(n=>n.props.children==='Refresh requests').props.onClick();host.reads[1].resolve({data:[],error:null});await settle();host.render();
const firstForm=host.nodes('form')[0];const write=deferred();host.setRpc(()=>write.promise);host.send(firstForm);host.send(firstForm);assert.equal(host.writes.length,1,'double submit must be locked synchronously');
assert.equal(host.writes[0].args.p_start,'2026-11-01T07:00:00.000Z','Nairobi time must reach UTC');
write.resolve({error:null});await settle();host.reads[2].reject(new Error('refresh failed'));await settle();host.render();
assert(host.text().includes('Request sent.'));assert(host.text().includes('Requests could not load'),'save success and read failure must remain distinguishable');
const admin=harness({kind:'event',admin:true});admin.render();
const old=admin.reads[0];admin.nodes('select')[0].props.onChange({target:{value:'approved'}});admin.render();
const approved={id:'r',event_id:'e',community_id:null,status:'approved',reason:'Saved approval reason.',requested_start:'2026-11-01T07:00:00Z',requested_end:'2026-11-02T07:00:00Z'};
admin.reads[1].resolve({data:[approved],error:null});await settle();admin.render();old.resolve({data:[],error:null});await settle();admin.render();
assert(admin.text().includes('Saved approval reason.'),'late old reads must not replace selected queue');
assert(!admin.nodes('button').some(n=>n.props.children==='Approve dates'),'approved spots cannot be silently reapproved');
assert(admin.nodes('button').some(n=>n.props.children==='Remove featured spot'));
console.log('L1 featured request recovery passed: failed reads block writes, retry works, double submission is prevented, Nairobi dates convert correctly, save/read outcomes remain distinct and stale reads cannot overwrite the Admin queue.');
