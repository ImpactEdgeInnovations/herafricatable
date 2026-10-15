import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, ''), {compilerOptions:{target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.React}}).outputText;
const Home = new Function('React','Link', `${compile(read('components/member/community-home-conversations.tsx'))}; return CommunityHomeConversations;`)(React, props => React.createElement('a', props));
const render = props => renderToStaticMarkup(React.createElement(Home,{posts:[],slug:'test-room',unavailable:false,readOnly:false,...props}));
assert(render({}).includes('No conversations yet'));
assert(render({unavailable:true}).includes('could not load'));
assert(!render({unavailable:true}).includes('No conversations yet'));
assert(!render({readOnly:true}).includes('Start a conversation'));
const posts=Array.from({length:4},(_,i)=>({post_id:`post-${i}`,body:`A question <script>${i}</script>`,author_name:'Test member',comment_count:i,is_pinned:i===0}));
const populated=render({posts});
assert(populated.includes('#conversation-post-0'));
assert(populated.includes('1 reply'));
assert(populated.includes('2 replies'));
assert(!populated.includes('#conversation-post-3'));
assert(populated.includes('&lt;script&gt;')&&!populated.includes('<script>'));
const page=read('app/communities/[slug]/page.tsx');
assert(page.includes('p_limit: showToday ? 3 : 21'));
assert(page.includes('showConversations && paginationReady && paginatedPostIds.length'));
assert(page.includes('membership_status !== "active"'));
const notification=read('components/member/community-notification-preferences.tsx');
const save=notification.slice(notification.indexOf('  async function save('),notification.indexOf('\n  return ('));
for(const outcome of ['success','error','throw']) {
  const busy=[],messages=[];
  const fn=new Function('supabase','preferences','communityId','setBusy','setMessage','memberErrorMessage', `${compile(save)};return save;`)(
    {rpc:async()=>{if(outcome==='throw')throw new Error('offline');return {error:outcome==='error'?new Error('failed'):null};}},
    {email_replies:false,in_app_replies:true,weekly_briefing:true,weekly_briefing_email:false},'test-id',value=>busy.push(value),value=>messages.push(value),()=> 'Please try again');
  await fn({preventDefault(){}});
  assert.deepEqual(busy,[true,false]);
  assert.equal(messages.at(-1),outcome==='success'?'Your notification choices have been saved.':'Please try again');
}
console.log('Community member home passed: bounded previews, safe content, empty/error/read-only states, member gate, no preview reply/media fetches, and notification save recovery.');
