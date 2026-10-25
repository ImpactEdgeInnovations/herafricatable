import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {memberDirectoryHref,memberPageSize} from '../lib/member-directory-paging.mjs';
const root=new URL('../',import.meta.url), read=file=>readFileSync(new URL(file,root),'utf8');
const compile=source=>ts.transpileModule(source.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
const Link=({children,prefetch,...props})=>React.createElement('a',props,children);
const LocalNav=new Function('React','Link','useRouter','ScrollableTabs',`${compile(read('components/member/community-local-navigation.tsx'))};return CommunityLocalNavigation;`)(React,Link,()=>({push(){}}),({children,className})=>React.createElement('div',{className:`scrollable-tabs ${className}`},React.createElement('div',{className:'scrollable-tabs-strip'},children)));
const room=renderToStaticMarkup(React.createElement(LocalNav,{slug:'example',canManage:false,active:'conversations'}));
for(const label of ['Conversations','Meetups','Photos','People'])assert(room.includes(`>${label}</a>`));
assert(!room.includes('Host tools'));assert(room.includes('Photos and videos'));
const host=renderToStaticMarkup(React.createElement(LocalNav,{slug:'example',canManage:true,active:'overview'}));assert(host.includes('Host tools'));assert(host.includes('class="community-overview-link" aria-current="page"'));
const Hub=new Function('React','Link','useRouter','useMemo','useState','createClient','useActionDialog','memberErrorMessage','memberDirectoryHref','memberPageSize',`${compile(read('components/member/network-hub.tsx'))};return NetworkHub;`)(React,Link,()=>({refresh(){},push(){}}),React.useMemo,React.useState,()=>({}),()=>({ask:async()=>false,dialog:null}),()=> 'Please try again',memberDirectoryHref,memberPageSize);
const people=Array.from({length:4},(_,i)=>({user_id:`test-${i}`,display_name:['Amina — example','Zuri — example','Wanjiku — example','Nadia — example'][i],city:'Nairobi',country:'Kenya',job_title:['Founder','Architect','Food entrepreneur','Designer'][i],company:null,business_name:null,avatar_url:null,connection_status:null,industry:'Business',goals:[],interests:[],languages:[],bio:null,website_url:null}));
const hubProps={members:people,connections:[],connectionCode:'',contacts:[],blockedMembers:[],savedMembers:[],suggestedMembers:[],curatedIntroductions:[],connectionAvailability:[],followups:[],outcomes:[],cityFilter:'',goalFilter:'',searchQuery:''};
const rendered=renderToStaticMarkup(React.createElement(Hub,hubProps));
assert.equal((rendered.match(/class="directory-avatar"/g)||[]).length,4);assert(rendered.includes('>Connect</button>'));assert(rendered.includes('/members/test-0'));
const css=read('app/members-club.css');assert(css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'));assert(css.includes('.button.button-primary:disabled'));
const radar=read('components/events/event-networking.module.css');assert(radar.includes('prefers-reduced-motion:reduce'));assert(radar.includes('animation:none'));
if(process.argv.includes('--preview')) {
  const target=new URL('tmp/design-c-preview/',root);mkdirSync(target,{recursive:true});
  const allCss=[...read('app/layout.tsx').matchAll(/^import "\.\/(.+\.css)";/gm)].map(x=>read(`app/${x[1]}`)).join('\n');writeFileSync(new URL('styles.css',target),allCss);
  const shell=(title,body,classes)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — example data</title><link rel="stylesheet" href="styles.css"></head><body class="hat-design-c"><main class="${classes}"><p style="padding:20px">LAYOUT TEST · EXAMPLE PEOPLE · NO LIVE ACTIONS</p>${body}</main></body></html>`;
  writeFileSync(new URL('people.html',target),shell('People',`<section class="network-hero"><h1>People to meet</h1></section>${rendered}`,'network-page'));
  writeFileSync(new URL('community.html',target),shell('Community',`<section class="community-room-hero"><div class="community-room-hero-copy"><div class="community-room-title"><span class="community-room-icon is-placeholder">L</span><div><p class="eyebrow">Example Community</p><h1>Lavington Women</h1></div></div><p>A place to share ideas, meet locally and keep in touch.</p><div class="community-room-meta"><span>Community Host · Example member</span><span>12 members · Example data</span></div></div></section>${room}<section class="community-home-conversations"><h2>Latest conversations</h2><div class="community-home-posts"><a href="#"><span class="community-home-avatar">A</span><div class="community-home-post-author"><strong>Amina — example</strong><time>25 Oct</time></div><p>What would you like us to explore at our next meetup?</p><small>3 replies · Read conversation →</small></a></div></section>`,'community-page community-room-page'));
}
console.log('PASS: actual Community navigation and role-gated Host link, actual People cards and Connect destinations, fixed essential action colours, four-item mobile layout and radar reduced-motion contract.');
