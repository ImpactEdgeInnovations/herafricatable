import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {prepareCommunityCover} from '../lib/community-image-preview.ts';

const original = {Image:globalThis.Image, document:globalThis.document, create:URL.createObjectURL, revoke:URL.revokeObjectURL};
let dimensions={width:800,height:600}, draw, canvas, fill, decoded=false, mode='ok', revoked=0;
URL.createObjectURL=()=> 'blob:cover-test';
URL.revokeObjectURL=()=>{revoked++;};
globalThis.Image=class {
  constructor(){this.naturalWidth=dimensions.width;this.naturalHeight=dimensions.height;}
  set src(value){queueMicrotask(()=>{decoded=true;mode==='decode-error'?this.onerror():this.onload();});}
};
globalThis.document={createElement(){
  canvas={width:0,height:0,getContext(){return mode==='no-context'?null:{fillRect(...args){fill=args;},drawImage(...args){draw=args.slice(1);}};},
    toBlob(callback){callback(mode==='encode-error'?null:new Blob(['prepared'],{type:mode==='png-fallback'?'image/png':'image/webp'}));}};
  return canvas;
}};
try {
  const input=new Blob(['source'],{type:'image/jpeg'});
  let file=await prepareCommunityCover(input);
  assert.equal(file.type,'image/webp');assert.equal(file.name,'community-cover.webp');
  assert.deepEqual([canvas.width,canvas.height],[1200,400]);assert.deepEqual(fill,[0,0,1200,400]);
  const expected=[0,0,800,600,(1200-800*(2/3))/2,0,800*(2/3),400];
  draw.forEach((value,index)=>assert(Math.abs(value-expected[index])<1e-8,'whole landscape retains all pixels'));
  dimensions={width:300,height:600};await prepareCommunityCover(input);
  assert.deepEqual(draw,[0,0,300,600,500,0,200,400],'portrait is contained, not cropped');
  dimensions={width:300,height:200};await prepareCommunityCover(input);
  assert.deepEqual(draw,[0,0,300,200,450,100,300,200],'small image is not enlarged');
  dimensions={width:2400,height:800};await prepareCommunityCover(input);
  assert.deepEqual(draw,[0,0,2400,800,0,0,1200,400],'wide image fills naturally');
  dimensions={width:600,height:1200};await prepareCommunityCover(input,'fill');
  assert.deepEqual(draw,[0,500,600,200,0,0,1200,400],'fill is an explicit centre crop');
  mode='png-fallback';file=await prepareCommunityCover(input);assert.equal(file.name,'community-cover.png');assert.equal(file.type,'image/png');
  for(const failure of ['decode-error','no-context','encode-error']){
    mode=failure;const before=revoked;await assert.rejects(prepareCommunityCover(input));assert.equal(revoked,before+1,'failure releases source');
  }
  mode='ok';
  for(const size of [{width:127,height:200},{width:6001,height:400},{width:0,height:0}]){
    dimensions=size;await assert.rejects(prepareCommunityCover(input),/128 and 6000/);
  }
  decoded=false;await assert.rejects(prepareCommunityCover(new Blob(['x'],{type:'image/svg+xml'})));assert.equal(decoded,false);
  await assert.rejects(prepareCommunityCover(new Blob([new Uint8Array(8*1024*1024+1)],{type:'image/png'})));
} finally {
  globalThis.Image=original.Image;globalThis.document=original.document;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;
}

// Execute the real selection handler: no upload until explicit Save, and a
// failed replacement preserves the previous prepared cover.
const source=readFileSync(new URL('../components/member/community-branding-panel.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('panel.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='chooseCover')handler=node.getText(tree);ts.forEachChild(node,visit);}visit(tree);
assert(handler);
const code=ts.transpileModule(handler,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
for(const failure of [false,true]) {
  let cover='old',fit='whole',release;const busy=[],messages=[],preparingCover={current:false},coverSource={current:'original'},draft={removeCover:true};
  const context={busy:false,preparingCover,coverSource,setCover:value=>{cover=value;},setCoverFit:value=>{fit=value;},setBusy:value=>busy.push(value),setPreparing(){},setMessage:value=>messages.push(value),setDraft:fn=>Object.assign(draft,fn(draft)),memberErrorMessage:()=> 'Cannot read image.',prepareCommunityCover:()=>new Promise((resolve,reject)=>{release=()=>failure?reject(Error('bad file')):resolve('prepared');})};
  const choose=new Function(...Object.keys(context),`${code};return chooseCover;`)(...Object.values(context));
  const pending=choose('new','fill');await choose('duplicate');assert.equal(preparingCover.current,true);
  release();await pending;assert.equal(preparingCover.current,false);assert.equal(busy.at(-1),false);
  assert.equal(cover,failure?'old':'prepared');assert.equal(coverSource.current,failure?'original':'new');assert.equal(fit,failure?'whole':'fill');
  if(!failure){assert.equal(draft.removeCover,false);assert.match(messages.at(-1),/not saved yet/);}
  else assert.equal(messages.at(-1),'Cannot read image.');
  await choose(null);assert.equal(cover,null);assert.equal(coverSource.current,null);
}
assert(source.includes('src={coverPreview ?? identity?.cover_url ?? ""}'));
assert(source.includes('Keep the whole image'));assert(source.includes('Fill the banner'));
console.log('Community cover L1 passed: real preparation geometry, no default stretching/cropping, bounded output, format fallback, failure cleanup and selection recovery. Browser/Storage acceptance remains separate.');
