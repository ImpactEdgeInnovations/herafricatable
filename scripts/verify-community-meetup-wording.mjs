import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const nav = read('components/member/community-local-navigation.tsx');
const source = nav.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const Link = ({ children, ...props }) => React.createElement('a', props, children);
const Navigation = new Function('React', 'Link', 'useRef', 'useEffect', `${code};return CommunityLocalNavigation;`)(React, Link, () => ({ current: null }), () => {});
for (const canManage of [false, true]) {
  const html = renderToStaticMarkup(React.createElement(Navigation, { active: 'gatherings', canManage, slug: 'lavington-women' }));
  assert(html.includes('>Meetups</a>') && !html.includes('>Gatherings</a>'));
  assert(html.includes('aria-current="page"') && html.includes('/communities/lavington-women?view=gatherings'));
  assert.equal(html.includes('Host tools'), canManage);
}
const planner = read('components/community/community-event-proposal-panel.tsx');
for (const label of ['Create a meetup', 'Meetup name', 'Watch together', 'View meetup']) assert(planner.includes(label), label);
for (const stable of ['publish_community_gathering', 'list_community_gathering_cards', 'value="watch_video"', 'value="video_call"', 'id="gathering-proposals"']) assert(planner.includes(stable), stable);
const list = read('components/member/community-gatherings.tsx');
for (const label of ['Upcoming meetups', 'Past meetups', 'Join meetup', 'Back to meetups']) assert(list.includes(label), label);
assert(list.includes('url.searchParams.set("view","gatherings")') && list.includes('"gatheringArea"'));
assert(read('components/member/community-gathering-room.tsx').includes('communityDraftKey(currentUserId, "gathering-message"'));
assert(read('components/member/community-event-linker.tsx').includes('reason.startsWith("This gathering already has member activity")'), 'Legacy database error matching must remain intact');
assert(read('components/member/member-header.tsx').includes('label: "Events"'));
assert(read('components/events/event-repeat-planner.tsx').includes('communityId?"meetup":"event"'));
assert(read('app/api/table-guide/route.ts').includes('Meetups holds attendance choices'));
assert(read('components/member/floating-table-guide.tsx').includes('Help me prepare for a meetup.'));
console.log('Meetup wording passed: rendered member/Host tabs, plain creation/action labels, unchanged deep links/RPCs/draft keys, legacy database error handling, separate public Events and aligned Nia guidance.');
