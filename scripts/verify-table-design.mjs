import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const compile = source => ts.transpileModule(source.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const Link = ({ children, prefetch: _prefetch, ...props }) => React.createElement('a', props, children);
const reads = [];
let signedIn = true;
const client = {
  auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'fixture' } : null } }) },
  from(table) {
    assert(['profiles', 'notifications'].includes(table));
    const query = new Proxy({}, { get(_, method) {
      if (method === 'then') return resolve => resolve({ data: table === 'profiles' ? { display_name: 'Preview Member', avatar_url: null } : null, count: 3 });
      assert(['select', 'eq', 'is', 'maybeSingle'].includes(method), `No write method in visual render: ${String(method)}`);
      return (...args) => { reads.push([table, method, args]); return query; };
    } });
    return query;
  },
  rpc: async name => {
    assert(['list_my_community_activity', 'get_my_table_guide_access'].includes(name));
    return { data: name === 'list_my_community_activity' ? [{ new_activity_count: 2 }] : [] };
  },
};
const { MemberHeader } = new Function('React', 'Link', 'SignOutButton', 'FloatingTableGuide', 'createClient',
  `${compile(read('components/member/member-header.tsx'))};return {MemberHeader};`)(React, Link,
  () => React.createElement('button', { className: 'session-sign-out', type: 'button' }, 'Sign out'), () => null, async () => client);
const header = await MemberHeader({ active: 'home', label: 'Member home' });
const headerHtml = renderToStaticMarkup(header);
assert(headerHtml.includes('class="member-sidebar"'));
for (const path of ['/home', '/events', '/communities', '/network', '/messages', '/explore', '/profile', '/support', '/search', '/notifications']) assert(headerHtml.includes(`href="${path}"`), path);
assert(headerHtml.includes('Sign out') && headerHtml.includes('aria-current="page"'));
assert(!headerHtml.includes('/admin'), 'A visual navigation change must not invent an Admin grant');
assert(headerHtml.includes('aria-label="Member shortcuts"'));
const dock=headerHtml.split('aria-label="Member shortcuts"')[1].split('</nav>')[0];
assert.equal((dock.match(/<a /g)||[]).length,4,'Four stable mobile destinations');
for(const label of ['Home','Events','Communities','People'])assert(dock.includes(`>${label}`)||dock.includes(label));
assert(!dock.includes('href="/messages"'));assert(headerHtml.includes('class="member-message-link"'),'Messages remains accessible from header');
signedIn = false;
assert(!renderToStaticMarkup(await MemberHeader({ active: 'events', label: 'Events' })).includes('class="member-sidebar"'));

const { YourTableToday } = new Function('React', 'Link', 'EventPosterImage', `${compile(read('components/member/your-table-today.tsx'))};return {YourTableToday};`)(React, Link,({src,alt})=>React.createElement('figure',{className:'event-detail-poster'},React.createElement('img',{src,alt})));
const suggestion = (title, href, kicker, action, description) => ({ title, href, kicker, action, description });
const props = {
  community: suggestion('Food, Fitness & Fashion', '/communities/fixture', 'Your Community', 'Open Community', 'Pick up a conversation, share an idea or see what’s coming up.'),
  person: suggestion('Meet someone new', '/network', 'Who to meet', 'Meet members', 'Browse profiles members have chosen to share.'),
  action: suggestion('Your updates', '/notifications', 'What to follow up on', 'See updates', 'Your latest replies and invitations are here.'),
};
const todayHtml = renderToStaticMarkup(React.createElement(YourTableToday, props));
assert.equal((todayHtml.match(/<article/g) || []).length, 3);
assert(todayHtml.indexOf('Food, Fitness') < todayHtml.indexOf('Meet someone new'));
assert(todayHtml.indexOf('Your updates') < todayHtml.indexOf('Food, Fitness'),'One personalised next action leads the home');
assert.equal((todayHtml.match(/button button-primary/g)||[]).length,1);
for (const s of Object.values(props)) assert(todayHtml.includes(`href="${s.href}"`));
assert(todayHtml.includes('Food, Fitness &amp; Fashion'), 'Real titles must remain escaped');
assert(!todayHtml.includes('Coming up at the Table'), 'Do not invent an event when none is supplied');
const upcoming = { title: 'Food & Tech Event', when: '6 November, 10:00 EAT', location: 'Nairobi', href: '/events/fixture' };
const populatedToday = React.createElement(YourTableToday, { ...props, upcoming });
assert(renderToStaticMarkup(populatedToday).includes('href="/events/fixture"'));
assert(renderToStaticMarkup(React.createElement(YourTableToday,{...props,upcoming:{...upcoming,poster:'/api/events/example/poster'}})).includes('src="/api/events/example/poster"'),'Home uses the authorised event image path rather than fake member photography');

const layout = read('app/layout.tsx');
assert(layout.includes('className="hat-design-c"'));
assert(layout.indexOf('./table-design.css') > layout.indexOf('./featured-spots.css'));
assert(read('app/manifest.ts').includes('theme_color: "#215846"'));
assert(read('public/sw.js').includes('hat-public-shell-v2-green'));

// Optional isolated preview uses the real rendered components and actual CSS.
// It has no live account, API calls or mutable controls and is never an app route.
if (process.argv.includes('--preview')) {
  const output = new URL('tmp/design-c-preview/', root);
  mkdirSync(output, { recursive: true });
  const styles = [...layout.matchAll(/^import "\.\/(.+\.css)";/gm)].map(match => read(`app/${match[1]}`)).join('\n');
  writeFileSync(new URL('styles.css', output), styles);
  const content = React.createElement('main', { className: 'member-home-page' }, header,
    React.createElement('section', { className: 'member-welcome' }, React.createElement('div', { className: 'member-welcome-copy' },
      React.createElement('p', { className: 'member-state' }, 'DESIGN QA · EXAMPLE MEMBER'),
      React.createElement('h1', null, 'Welcome, Amina.'),
      React.createElement('p', null, 'Here are a few places to start today.'))), populatedToday);
  writeFileSync(new URL('index.html', output), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HAT actual-component visual QA</title><link rel="stylesheet" href="styles.css"></head><body class="hat-design-c"><div id="hat-page-content">${renderToStaticMarkup(content)}</div></body></html>`);
}
console.log('Green design render passed: four mobile destinations, visible messages/profile/sign out, no invented Admin grant, one leading next action, real destinations, escaped titles, honest event absence and green PWA identity. Visual fixture is not live acceptance.');
