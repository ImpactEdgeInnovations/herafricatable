import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const themes=read('lib/brand-themes.ts');
const css=read('app/community-overhaul.css');
function lum(hex){const a=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
function contrast(a,b){return (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);}
const matches=[...themes.matchAll(/key: "(\w+)".*accent: "#(\w+)".*hover: "#(\w+)".*soft: "#(\w+)"/g)];
assert.equal(matches.length,5);
for(const [,key,accent,hover,soft] of matches){
  assert(contrast(accent,'ffffff')>=4.5,`${key} button contrast`);
  assert(contrast(hover,'ffffff')>=4.5,`${key} hover contrast`);
  assert(contrast(accent,soft)>=4.5,`${key} badge contrast`);
  assert(css.includes(`--room-accent: #${accent}`));
}
assert(read('components/events/event-appearance.tsx').includes('set_event_appearance'));
assert(read('supabase/migrations/20261007193510_event_safe_appearance.sql').includes('public.can_host_event(p_event_id) or public.can_manage_event(p_event_id)'));
assert(read('app/communities/[slug]/page.tsx').includes('data-brand-accent={brandAccent(brandIdentity?.accent_key)}'));
assert(read('app/events/[slug]/page.tsx').includes('data-brand-accent={brandAccent(event.appearance_accent_key)}'));
console.log('Five constrained brand themes passed text, button, hover and badge contrast plus save/render contracts. Device acceptance is separate.');
