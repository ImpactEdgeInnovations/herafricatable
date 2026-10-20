import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source.replace(/^import.*;\n/gm, '').replace(/^export /gm, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const loaderSource = read('lib/landing-events.ts');
const loaderCode = compile(loaderSource);
const { loadLandingEvents } = new Function(`${loaderCode};return {loadLandingEvents};`)();
const now = new Date('2026-10-15T12:00:00Z');
const event = (id, overrides = {}) => ({ id, slug: `event-${id}`, title: `Event ${id}`, summary: null, format: 'in_person',
  starts_at: '2026-10-26T07:00:00Z', ends_at: '2026-10-26T09:00:00Z', timezone: 'Africa/Nairobi',
  venues: { name: 'Geco Cafe', city: 'Nairobi', country: 'Kenya' }, status: 'published', audience: 'public', ...overrides });
function fakeClient(rows, options = {}) {
  const calls = [];
  const query = {};
  for (const method of ['select', 'eq', 'gte', 'order']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.limit = async n => { calls.push(['limit', n]); if (options.throwQuery) throw Error('offline'); return { data: rows, error: options.queryError || null }; };
  return { calls, from: table => { calls.push(['from', table]); return query; },
    rpc: async (name, args) => { calls.push(['rpc', name, args]); if (options.throwArtwork) throw Error('offline'); return { data: options[name] || [], error: null }; },
    storage: { from: bucket => ({ createSignedUrl: async (path, ttl) => { calls.push(['sign', bucket, path, ttl]); return options.signFail === bucket ? { error: 'denied' } : { data: { signedUrl: `https://example.org/${bucket}/${path}` } }; } }) },
  };
}
const fixtures = [event('one'), event('private', { audience: 'community' }), event('draft', { status: 'draft' }),
  event('past', { ends_at: '2026-10-01T09:00:00Z' }), event('bad-slug', { slug: '../private' }),
  event('bad-date', { starts_at: 'invalid' }), event('backwards', { ends_at: '2026-10-25T09:00:00Z' }), event('two')];
const client = fakeClient(fixtures, {
  list_public_event_host_covers: [{ event_id: 'one', storage_path: 'cover.webp', alt_text: 'Approved cover' }, { event_id: 'private', storage_path: 'private.webp' }],
});
const listing = await loadLandingEvents(client, now);
assert.deepEqual(listing.events.map(e => e.id), ['one', 'two']);
assert.equal(listing.events[0].image.alt, 'Approved cover');
assert(!listing.unavailable);
assert(client.calls.some(c => c[0] === 'eq' && c[1] === 'status' && c[2] === 'published'));
assert(client.calls.some(c => c[0] === 'eq' && c[1] === 'audience' && c[2] === 'public'));
assert(client.calls.some(c => c[0] === 'gte' && c[1] === 'ends_at' && c[2] === now.toISOString()));
assert(client.calls.some(c => c[0] === 'limit' && c[1] === 3));
for (const call of client.calls.filter(c => c[0] === 'rpc')) assert.deepEqual(call[2].p_event_ids, ['one', 'two']);
assert(!client.calls.some(c => c[0] === 'sign' && c[2] === 'private.webp'));
assert.equal('status' in listing.events[0], false);
const fallback = fakeClient([event('one')], { signFail: 'event-host-covers',
  list_public_event_host_covers: [{ event_id: 'one', storage_path: 'cover.webp' }],
  list_public_event_proposal_posters: [{ event_id: 'one', storage_path: 'poster.webp' }],
});
assert((await loadLandingEvents(fallback, now)).events[0].image.url.includes('proposal-media/poster.webp'));
assert.equal((await loadLandingEvents(fakeClient([event('one')], { throwArtwork: true }), now)).events[0].image, null);
assert.deepEqual(await loadLandingEvents(fakeClient([]), now), { events: [], unavailable: false });
for (const options of [{ queryError: 'denied' }, { throwQuery: true }]) assert.deepEqual(await loadLandingEvents(fakeClient([], options), now), { events: [], unavailable: true });
assert.equal((await loadLandingEvents(fakeClient([event('1'), event('2'), event('3'), event('4')]), now)).events.length, 3);

let factoryArgs;
const factory = (...args) => { factoryArgs = args; return fakeClient([]); };
const { getLandingEvents } = new Function('createClient', 'getSupabasePublicEnv', `${loaderCode};return {getLandingEvents};`)(factory, () => ({ url: 'https://public.example', publishableKey: 'public-test-key' }));
await getLandingEvents();
assert.equal(factoryArgs[1], 'public-test-key');
assert.deepEqual(factoryArgs[2].auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
assert(!loaderSource.includes('service_role') && !loaderSource.includes('createServerClient'));

const Link = ({ children, ...props }) => React.createElement('a', props, children);
const styles = new Proxy({}, { get: (_, key) => String(key) });
const { LandingPage, landingEventDate } = new Function('React', 'Link', 'InstallAppButton', 'EventCountdown', 'styles',
  `${compile(read('components/landing/landing-page.tsx'))};return {LandingPage,landingEventDate};`)(React, Link,
  () => React.createElement('button', null, 'Install app'), () => React.createElement('div', null, 'Countdown'), styles);
const render = props => renderToStaticMarkup(React.createElement(LandingPage, { openPilot: true, countdown: null, listing, ...props }));
const html = render();
assert.equal((html.match(/<h1 /g) || []).length, 1);
assert.equal((html.match(/>Event one</g) || []).length, 1);
assert.equal((html.match(/>Event two</g) || []).length, 1);
for (const path of ['/sign-in', '/sign-in?mode=apply', '/events', '/communities', '/faq', '/privacy', '/terms', '/community-guidelines']) assert(html.includes(`href="${path}"`), path);
for (const text of ['Meet at the Table.', 'Make it your own.', 'Confirm your email', 'no approval wait', 'Sign in to see the Communities', 'Install app']) assert(html.includes(text), text);
assert(!html.includes('Our team reviews your request privately'));
const manual = render({ openPilot: false });
assert(manual.includes('Our team reviews your request privately') && !manual.includes('no approval wait'));
for (const unavailable of [false, true]) {
  const empty = render({ listing: { events: [], unavailable } });
  assert(!empty.includes('Event one') && !empty.includes('Date to be shared'));
  assert.equal(empty.includes('The calendar is taking a moment.'), unavailable);
}
assert(render({ countdown: { event_name: 'Approved', city: 'Nairobi', starts_at: '2026-10-26T07:00:00Z' } }).includes('Countdown'));
assert(!html.includes('Countdown'));
const previousTZ = process.env.TZ;
const dateFixture = event('date', { starts_at: '2026-10-25T23:00:00Z' });
process.env.TZ = 'America/Los_Angeles';
const west = landingEventDate(dateFixture);
process.env.TZ = 'UTC';
assert.deepEqual(landingEventDate(dateFixture), west);
assert.equal(west.day, '26');
assert.deepEqual(landingEventDate({ ...dateFixture, timezone: 'invalid' }), west);
if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ;
const css = read('components/landing/landing-page.module.css');
assert(/object-fit:\s*contain/.test(css) && css.includes('focus-visible') && css.includes('prefers-reduced-motion'));
assert(css.includes('@media (max-width: 620px)'));
assert(read('app/page.tsx').includes('getLandingEvents()'));
console.log('Landing redesign passed: anonymous public-only event projection, artwork fallback, honest errors, three-event bound, timezone-safe dates, rendered pilot/manual journeys, links, single heading and scoped responsive styling.');
