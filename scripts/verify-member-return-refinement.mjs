import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { communityReturnSuggestion, memberNextSuggestion, recentPastEvent } from '../lib/member-return-suggestions.mjs';
import { matchesDiscoverySearch } from '../lib/discovery-search.mjs';
const read = path => readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const community = {name:'Lavington Women',slug:'lavington-women',new_activity_count:2,new_conversation_count:1,new_reply_count:1};
const options = {community,enabled:true,featureError:false,communityError:false,activityError:false};
assert.equal(communityReturnSuggestion(options).href,'/communities/lavington-women?view=conversations');
assert.equal(communityReturnSuggestion(options).action,'Catch up');
assert(communityReturnSuggestion({...options,activityError:true}).description.includes('could not load'));
assert.equal(communityReturnSuggestion({...options,activityError:true}).href,'/communities/lavington-women');
assert.equal(communityReturnSuggestion({...options,communityError:true}).href,'/communities');
assert(communityReturnSuggestion({...options,enabled:false}).title.includes('opening soon'));
assert.equal(communityReturnSuggestion({...options,community:undefined}).action,'Find a Community');
assert(!communityReturnSuggestion({...options,community:{...community,new_activity_count:0,new_reply_count:0,new_conversation_count:0}}).description.includes('caught up'));
const now = Date.parse('2026-10-08T09:00:00Z');
const past = {ends_at:'2026-10-07T20:00:00Z',slug:'rehearsal',title:'A safe rehearsal'};
assert.equal(recentPastEvent([{...past,ends_at:'invalid'},past],now),past);
assert.equal(recentPastEvent([{...past,ends_at:'2026-09-01T12:00:00Z'}],now),null);
assert.equal(recentPastEvent([{...past,ends_at:'2026-10-09T12:00:00Z'}],now),null);
const fallback = {label:'Events',action:'View events',description:'Browse events',href:'/events'};
const next = {unreadMessages:0,dueFollowups:[],pastEvent:past,unreadNotifications:0,fallback};
assert.equal(memberNextSuggestion({...next,unreadMessages:1}).href,'/messages');
assert.equal(memberNextSuggestion({...next,dueFollowups:[{next_step:'Compare notes',display_name:'Test member'}]}).href,'/network#network-connections');
assert.equal(memberNextSuggestion(next).href,'/events/rehearsal/follow-up');
assert.equal(memberNextSuggestion({...next,pastEvent:null,unreadNotifications:2}).href,'/notifications');
assert.equal(memberNextSuggestion({...next,pastEvent:null}),fallback);

function component(path,name) {
  const source = read(path).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
  const code = ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  return new Function('React','Link','useMemo','useState','useRouter','createClient','useActionDialog','memberErrorMessage','matchesDiscoverySearch',`${code};return ${name};`)(
    React,({href,children,...props})=>React.createElement('a',{href,...props},children),
    fn=>fn(),initial=>[typeof initial==='function'?initial():initial,()=>{}],()=>({refresh(){}}),()=>({rpc(){throw Error('Rendering must not call a database command');}}),()=>({dialog:null,ask:async()=>null}),()=> 'Try again',matchesDiscoverySearch,
  );
}
const CommunityDirectory = component('components/member/community-directory.tsx','CommunityDirectory');
const directory = renderToStaticMarkup(React.createElement(CommunityDirectory,{communities:[]}));
assert(directory.includes('community-directory-searchbar'));
assert(directory.includes('aria-label="Find Communities"'));
assert(directory.includes('id="community-search"') && directory.includes('id="community-location"'));
const NetworkHub = component('components/member/network-hub.tsx','NetworkHub');
const member = {avatar_url:null,bio:'A test profile',business_name:null,city:'Nairobi',company:'Test company',connection_status:null,country:'Kenya',display_name:'Rehearsal Member',goals:[],industry:'Trade',interests:[],job_title:'Founder',languages:[],user_id:'fixture',website_url:null};
const props = {members:[member],connections:[],connectionCode:'ABC12345',contacts:[],blockedMembers:[],savedMembers:[],suggestedMembers:[],curatedIntroductions:[],connectionAvailability:[],followups:[],outcomes:[],cityFilter:'',goalFilter:'',searchQuery:''};
const render = extra=>renderToStaticMarkup(React.createElement(NetworkHub,{...props,...extra}));
const healthy = render({});
function filterFormKey(element) {
  if (!element || typeof element !== 'object') return undefined;
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = filterFormKey(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (element.type === 'form' && element.props.className === 'directory-filters') return element.key;
  return filterFormKey(element.props?.children);
}
assert.equal(filterFormKey(NetworkHub(props)), JSON.stringify(['','','']));
assert.notEqual(filterFormKey(NetworkHub({...props,searchQuery:'missing'})), filterFormKey(NetworkHub(props)), 'Filter fields must remount when server query changes, including Show all members recovery');
assert.equal(filterFormKey(NetworkHub({...props,cityFilter:'Nairobi',goalFilter:'business'})), JSON.stringify(['','Nairobi','business']));
assert(healthy.includes('id="browse-members"'));
assert(healthy.includes('name="q"') && healthy.includes('name="city"') && healthy.includes('name="goal"'));
assert(healthy.includes('1 member available to meet'));
const failed = render({unavailableAreas:['saved','code']});
assert(failed.includes('Rehearsal Member') && failed.includes('Some extras could not load'));
assert(/<button[^>]*disabled=""[^>]*>Save<\/button>/.test(failed));
assert(!failed.includes('network-code-tools'));
assert(render({members:[],searchQuery:'missing'}).includes('Show all members'));
const connection = {avatar_url:null,city:'Nairobi',company:null,connection_id:'connection',country:'Kenya',direction:'outgoing',display_name:'Test connection',job_title:null,introduction_note:null,other_user_id:'other',status:'accepted',updated_at:'2026-10-08'};
const unavailablePrivateTools = render({connections:[connection],unavailableAreas:['followups','outcomes']});
assert(/<button[^>]*disabled=""[^>]*>Add reminder<\/button>/.test(unavailablePrivateTools));
assert(/<button[^>]*disabled=""[^>]*>Add result<\/button>/.test(unavailablePrivateTools));
const page = read('app/network/page.tsx');
const critical = page.slice(page.indexOf('const coreReadError'),page.indexOf('const unavailableAreas'));
for (const result of ['directoryResult.error','networkResult.error','availabilityResult.error','blocksResult.error']) assert(critical.includes(result));
for (const result of ['codeResult.error','savedResult.error','followupResult.error','outcomeResult.error']) assert(!critical.includes(result));
const pageCode = ts.transpileModule(page.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export default /gm,'').replace(/^export /gm,''),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
async function pageHtml(failedRpc, authenticated=true) {
  const fakeClient = {auth:{getUser:async()=>({data:{user:authenticated?{id:'fixture'}:null}})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{access_status:'active'}})}),rpc:async name=>name===failedRpc?{data:null,error:{message:'Simulated unavailable read'}}:{data:name==='list_member_directory'?[member]:name==='ensure_connection_code'?'ABC12345':[],error:null}};
  const Page = new Function('React','Link','redirect','NetworkHub','MemberHeader','createClient',`${pageCode};return NetworkPage;`)(React,({href,children})=>React.createElement('a',{href},children),path=>{throw Error(`redirect:${path}`);},props=>React.createElement('div',{'data-testid':'loaded-directory'},`${props.members.length}:${props.unavailableAreas.join(',')}`),()=>null,async()=>fakeClient);
  return renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
}
for (const rpc of ['list_my_saved_profiles','list_my_connection_followups','list_my_connection_outcomes','ensure_connection_code']) assert((await pageHtml(rpc)).includes('loaded-directory'),`${rpc} must not blank Members`);
for (const rpc of ['list_member_directory','list_my_network_with_context','list_connection_availability','list_my_blocks']) {
  const html = await pageHtml(rpc);
  assert(!html.includes('loaded-directory'),`${rpc} must fail closed`);
  assert(html.includes('We could not open the member list'));
}
await assert.rejects(()=>pageHtml(null,false),/redirect:\/sign-in/);
assert(read('app/home/page.tsx').includes('<InstallAppButton compact />'));
assert(read('app/explore/page.tsx').includes('<InstallAppButton compact />'));
const css = read('app/member-return-refinement.css');
assert(css.includes('grid-template-columns:minmax(0,420px) minmax(160px,240px)'));
assert(css.includes('@media(max-width:640px)'));
assert(!/\b(?:body|html|:root)\s*\{/.test(css));
console.log('Returning-member behaviour and rendered discovery passed: permission-projected catch-up, recent-event bounds, message/reminder priority, aligned search markup, real filter names, honest partial failures and disabled unknown private tools. Live role/device acceptance remains separate.');
