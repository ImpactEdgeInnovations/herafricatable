import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareCommunityImage} from '../lib/community-image-preview.ts';
let dimensions={width:1060,height:737}; let draw; let revoked=0;
const original={Image:globalThis.Image,document:globalThis.document,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
URL.createObjectURL=()=> 'blob:acceptance-only'; URL.revokeObjectURL=()=>{revoked++;};
globalThis.Image=class { constructor(){this.naturalWidth=dimensions.width;this.naturalHeight=dimensions.height;} set src(value){queueMicrotask(()=>this.onload());} };
globalThis.document={createElement(){return {getContext(){return {drawImage(...args){draw=args.slice(1);}};},toBlob(callback){callback(new Blob(['processed'],{type:'image/webp'}));}};}};
try {
  const file=await prepareCommunityImage(new Blob(['fixture'],{type:'image/jpeg'}));
  assert.equal(file.type,'image/webp'); assert.deepEqual(draw,[161.5,0,737,737,0,0,737,737]);
  dimensions={width:4000,height:3000}; await prepareCommunityImage(new Blob(['fixture'],{type:'image/png'}));
  assert.deepEqual(draw,[500,0,3000,3000,0,0,1024,1024]);
  await assert.rejects(prepareCommunityImage(new Blob(['fixture'],{type:'image/svg+xml'})));
  dimensions={width:120,height:120}; await assert.rejects(prepareCommunityImage(new Blob(['fixture'],{type:'image/jpeg'})));
  assert.equal(revoked,3,'Every temporary source must be released');
} finally {globalThis.Image=original.Image;globalThis.document=original.document;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const panel=read('components/member/community-branding-panel.tsx');
assert(panel.includes('Use this as Community image'));assert(panel.includes('.download(applicationImage.storage_path)'));
assert(panel.includes('Nothing has been changed yet.'));assert(panel.includes('save_community_brand_identity'));
assert(panel.includes('setIcon(null); setCover(null); clearFileInputs(); setMessage("");'));
const page=read('app/communities/[slug]/host/page.tsx');
assert(page.includes('.eq("owner_id", user.id)'));assert(page.includes('.in("status", ["submitted", "approved"])'));
assert(!page.includes('createAdminClient'),'Handoff must use the current owner and private Storage');
console.log('Community image handoff: bounded centre crop, MIME/size/dimension guards, object URL cleanup, private owner lookup, explicit save and complete discard passed. Real browser delivery remains separate.');
