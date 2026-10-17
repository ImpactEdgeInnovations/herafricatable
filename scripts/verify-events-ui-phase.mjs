import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { matchesDiscoverySearch } from '../lib/discovery-search.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('components/events/event-discovery.tsx').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const items = [
  { id: 'a', title: 'Women in Trade', summary: 'Finance and business', location: 'Nairobi', format: 'in person', content: React.createElement('article', null, 'NAIROBI_EVENT') },
  { id: 'b', title: 'Café founders', summary: 'Meet business owners', location: 'Online', format: 'online', content: React.createElement('article', null, 'ONLINE_EVENT') },
];
function render(query, location, format='', month='', visible=12, data=items) {
  let state = 0;
  const states=[query,location,format,month,visible];
  const Component = new Function('React', 'Fragment', 'useId', 'useState', 'matchesDiscoverySearch', `${code};return EventDiscovery;`)(React, React.Fragment, () => 'suggestions', initial => [states[state++] ?? initial, () => {}], matchesDiscoverySearch);
  return renderToStaticMarkup(React.createElement(Component, { items:data }));
}
assert(!render('','','online').includes('NAIROBI_EVENT'));
assert(render('','','online').includes('ONLINE_EVENT'));
const many=Array.from({length:100},(_,index)=>({...items[0],id:String(index),startsAt:'2026-10-31T22:30:00Z',timezone:'Africa/Nairobi',content:React.createElement('article',{'data-event':index},`EVENT_${index}`)}));
assert.equal((render('','','','',12,many).match(/data-event=/g)||[]).length,12);
assert(render('','','','',12,many).includes('Show more events'));
assert.equal((render('','','','',24,many).match(/data-event=/g)||[]).length,24);
assert(render('','','','2026-10',12,many).includes('No events match'));
assert(render('','','','2026-11',12,many).includes('EVENT_0'));
assert(render('', '').includes('NAIROBI_EVENT') && render('', '').includes('ONLINE_EVENT'));
assert(render('trade women', '').includes('NAIROBI_EVENT'));
assert(!render('trade women', '').includes('ONLINE_EVENT'));
assert(render('cafe', '').includes('ONLINE_EVENT'));
assert(!render('', 'Online').includes('NAIROBI_EVENT'));
assert(render('missing', '').includes('Show all events'));
assert(render('missing', '').includes('0 of 2'));
const page = read('app/events/page.tsx');
assert(page.includes('<EventDiscovery items=') && page.includes('public-event-booking-state'));
assert(page.includes('<EventCardMedia src={poster?.url}') && read('components/events/event-card-media.tsx').includes('loading="lazy"'));
const css = read('app/product-ui-foundation.css');
assert(css.includes('.public-event-poster') && css.includes('object-fit: contain'));
const mobile = read('components/events/event-mobile-action.tsx');
assert(mobile.includes('IntersectionObserver') && mobile.includes('document.getElementById("registration")'));
assert(mobile.includes('observer.disconnect()') && mobile.includes('hidden={!visible}'));
const mobileCode = ts.transpileModule(mobile.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const hero = {}, registration = {};
let visibility = false, callback, cleanup, didEffect = false, disconnected = false;
class Observer {
  constructor(fn) { callback = fn; }
  observe() {}
  disconnect() { disconnected = true; }
}
const MobileAction = new Function('React', 'useEffect', 'useState', 'Link', 'styles', 'window', 'document', 'IntersectionObserver', `${mobileCode};return EventMobileAction;`)(React,
  fn => { if (!didEffect) { didEffect = true; cleanup = fn(); } },
  () => [visibility, value => { visibility = value; }],
  ({href,children}) => React.createElement('a', {href}, children), {bar:'bar'}, {IntersectionObserver:Observer},
  {getElementById: id => id === 'registration' ? registration : hero}, Observer);
const mobileRender = () => renderToStaticMarkup(MobileAction({href:'/events/test/pass',label:'Open my pass',detail:'Free'}));
assert(mobileRender().includes('hidden=""'));
callback([{target:hero,isIntersecting:false},{target:registration,isIntersecting:false}]);
assert(!mobileRender().includes('hidden=""'));
assert(mobileRender().includes('/events/test/pass'));
callback([{target:registration,isIntersecting:true}]);
assert(mobileRender().includes('hidden=""'));
callback([{target:registration,isIntersecting:false},{target:hero,isIntersecting:true}]);
assert(mobileRender().includes('hidden=""'));
cleanup();
assert(disconnected);
const detail = read('app/events/[slug]/page.tsx');
assert(detail.includes('viewingAsHost ? "Manage your event"'));
assert(detail.includes('viewer.showBooking && !hasEnded && !gatheringRoomHref'));
assert(detail.includes('<MemberHeader active="events"'));
const confirmationCode=ts.transpileModule(read('components/member/meetup-place-confirmation.tsx').replace('export function','function'),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const Confirmation=new Function('React',`${confirmationCode};return MeetupPlaceConfirmation;`)(React);
const confirmation=renderToStaticMarkup(React.createElement(Confirmation));
assert(confirmation.includes('role="status"')&&confirmation.includes('Your place is saved')&&confirmation.includes('You’re going'));
assert(detail.includes('const mobileActionHref = hasEnded ? null') && detail.includes('event.registration_mode !== "closed" && !bookingClosed'));
assert(detail.includes('isConfirmedGuest ? `/events/${slug}/pass`'));
console.log('Events UI rendering passed: all-permitted results, multi-word/accent search, location filters, no-match recovery, uncropped posters and state-derived mobile action. Live booking/device acceptance remains separate.');
