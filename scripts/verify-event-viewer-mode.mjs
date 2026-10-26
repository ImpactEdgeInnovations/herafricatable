import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {eventViewerMode} from '../lib/events/viewer-mode.ts';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const compile=source=>ts.transpileModule(source.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
const base={creator:false,host:false,manager:false,previewRequested:false,checksReady:true,slug:'event',eventId:'id'};
for(const flags of [{creator:true,host:true},{host:true},{manager:true},{creator:true},{}, {host:true,manager:true}]){
  for(const previewRequested of [false,true]){
    const mode=eventViewerMode({...base,...flags,previewRequested});
    assert.equal(mode.viewingAsHost,Boolean(flags.host)&&!mode.memberPreview);
    assert.equal(mode.viewingAsAdmin,Boolean(flags.manager)&&!flags.host&&!mode.memberPreview);
    assert.equal(mode.memberPreview,previewRequested&&Boolean(flags.host||flags.manager||flags.creator));
    if(flags.manager&&!flags.host)assert(mode.controlsHref.startsWith('/admin/events?'));
    if(flags.creator&&!flags.host&&!flags.manager)assert.equal(mode.controlsHref,null,'creator history is not Host permission');
    if(mode.memberPreview)assert.equal(mode.showBooking,false);
  }
}
assert.equal(eventViewerMode({...base,manager:true}).identity,'You have Admin access to this event.');
assert.equal(eventViewerMode({...base,creator:true,host:true}).identity,'You created this event.');
assert.equal(eventViewerMode({...base,creator:true,host:true,manager:true,checksReady:false,previewRequested:true}).mayPreview,false);
assert.equal(eventViewerMode({...base,checksReady:false}).showBooking,false);

const Link=({href,children,...props})=>React.createElement('a',{href,...props,prefetch:undefined},children);
const context={React,Link,useMemo:React.useMemo,useState:React.useState,useRouter:()=>({refresh(){}}),createClient:()=>({rpc(){throw Error('Rendered preview must not call writes');}}),memberErrorMessage:()=> 'Try again.',useActionDialog:()=>({ask(){throw Error('Preview must not ask for a mutation');},dialog:null})};
const Questions=new Function(...Object.keys(context),`${compile(read('components/events/event-questions.tsx'))};return EventQuestions;`)(...Object.values(context));
const BookingPreview=new Function('React',`${compile(read('components/events/event-booking-preview.tsx'))};return EventBookingPreview;`)(React);
const NetworkingSchedule=new Function('React','styles',`${compile(read('components/events/event-networking-schedule.tsx'))};return NetworkingSchedule;`)(React,{});
const tickets=[{id:'ticket',name:'Free seat',description:'Our free ticket',price_minor:0,currency:'KES',bookingState:'available',inventory_quantity:20,sales_end_at:null,sales_start_at:null}];
const questions=[{question_id:'q',body:'VISIBLE_QUESTION',author_name:'Test',author_id:'other',created_at:'2026-01-01',question_status:'open',support_count:1,can_manage:true,supported_by_me:false},{question_id:'hidden',body:'HIDDEN_QUESTION',author_name:'Test',author_id:'other',created_at:'2026-01-01',question_status:'hidden',support_count:1,can_manage:true}];
let state=0;const states=[true,'q','',''];
const PreservedQuestions=new Function(...Object.keys(context),`${compile(read('components/events/event-questions.tsx'))};return EventQuestions;`)(...Object.values({...context,useState:initial=>[states[state++]??initial,()=>{}]}));
const qHtml=renderToStaticMarkup(React.createElement(PreservedQuestions,{readOnly:true,canAsk:true,currentUserId:'host',eventId:'id',eventSlug:'event',migrationReady:true,initialQuestions:[questions[0]]}));
assert(qHtml.includes('VISIBLE_QUESTION'));assert(!qHtml.includes('<form'));assert(!qHtml.includes('<button'));
// Even if an event handler were invoked programmatically, readOnly returns before RPC.
const questionText=read('components/events/event-questions.tsx');const tree=ts.createSourceFile('q.tsx',questionText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const handlers=[];function visit(node){if(ts.isFunctionDeclaration(node)&&['submitQuestion','support','answer','hide','report'].includes(node.name?.text))handlers.push(node);ts.forEachChild(node,visit);}visit(tree);
for(const node of handlers){const fn=new Function('readOnly',`${compile(node.getText(tree))};return ${node.name.text};`)(true);await fn({preventDefault(){}},questions[0]);}
assert.equal(handlers.length,5);

async function renderPage(role,{preview=false,fail=false,confirmed=false,active=true}={}) {
  const calls=[],mounted=[];
  const event={id:'event-id',slug:'event',title:'Food & Tech Event',summary:'A test event',format:'in_person',audience:'public',capacity:20,ends_at:'2099-11-06T18:00:00Z',starts_at:'2099-11-06T16:00:00Z',timezone:'Africa/Nairobi',registration_mode:'manual_review',free_instant_booking:true,venues:{name:'Venue',city:'Nairobi',country:'Kenya',address_line:'Road',map_url:null}};
  const actor={id:'viewer'};
  function from(table){
    const filters=[];const chain=new Proxy({}, {get(_,key){
      if(key==='then')return (resolve,reject)=>{
        calls.push({table,filters});
        let data=[];
        if(table==='events')data=event;
        if(table==='profiles')data={access_status:active?'active':'pending',display_name:'Viewer'};
        if(table==='member_event_proposals'){
          assert(filters.some(([key,value])=>key==='canonical_event_id'&&value==='event-id'));
          assert(!filters.some(([key])=>key==='event_id'));
          data=role.creator?{id:'proposal'}:null;
        }
        if(table==='event_memberships')data=confirmed?{status:'confirmed'}:null;
        if(table==='ticket_types')data=tickets;
        if(['orders','registration_requests','event_community_continuations'].includes(table))data=null;
        if(table==='event_menus')data={id:'menu',title:'Menu',introduction:'Our menu'};
        if(table==='menu_courses')data=[{id:'course',sort_order:0,name:'First course',description:''}];
        if(table==='menu_items')data=[{id:'dish',course_id:'course',name:'Food',description:'Dish'}];
        return Promise.resolve({data,error:fail&&table==='member_event_proposals'?Error('offline'):null}).then(resolve,reject);
      };
      return (...args)=>{if(key==='eq')filters.push(args);return chain;};
    }});return chain;
  }
  const client={auth:{getUser:async()=>({data:{user:actor}})},from,storage:{from:()=>({createSignedUrl:async()=>({data:null})})},rpc:async(name,args)=>{
    calls.push({rpc:name,args});
    const data={can_manage_event:!!role.manager,can_host_event:!!role.host,can_view_event_host_outcomes:!!role.pastHost,get_event_public_host:[],get_event_community_for_visitor:[{community_id:'community',slug:'community',name:'A Community',community_type:'private'}],list_event_questions:questions,get_my_table_guide_access:[],get_membership_intake_mode:'trusted_auto'};
    return {data:name==='get_event_networking_schedule'?null:data[name]??[],error:null};
  }};
  const stub=name=>()=>{mounted.push(name);return React.createElement('div',{'data-component':name});};
  const values={React,Link,NetworkingSchedule,createClient:async()=>client,createAdminClient:()=>client,notFound:()=>{throw Error('Unexpected not found');},eventViewerMode,EventBookingPreview:BookingPreview,EventQuestions:Questions,MemberHeader:stub('header'),EventRegistrationForm:stub('booking'),EventCommunityJoin:stub('community-join'),DestinationInvitationPanel:stub('invites'),MenuFeedbackControls:stub('feedback'),EventAttendeeDirectory:stub('attendees'),EventCommunityFollowUp:stub('follow-up'),MemberEventArchive:stub('archive'),FloatingTableGuide:stub('guide'),EventMobileAction:stub('mobile'),brandAccent:()=> 'wine',absoluteUrl:()=> '/',serializeJsonLd:JSON.stringify,getPublicEventSeo:async()=>[],loadEventBookingAvailability:async()=>({tickets,eventFull:false})};
  const Page=new Function(...Object.keys(values),`${compile(read('app/events/[slug]/page.tsx')).replace('default async function','async function')};return EventDetailPage;`)(...Object.values(values));
  const html=renderToStaticMarkup(await Page({params:Promise.resolve({slug:'event'}),searchParams:Promise.resolve(preview?{preview:'member'}:{})}));
  return {html,calls,mounted};
}
for(const role of [{creator:true,host:true},{host:true},{manager:true},{creator:true},{}, {pastHost:true}]) {
  const live=await renderPage(role);
  if(role.creator)assert(live.html.includes('You created this event.'));
  else if(role.host||role.pastHost)assert(live.html.includes('You are hosting this event.'));
  else if(role.manager)assert(live.html.includes('You have Admin access to this event.'));
  else assert(!live.html.includes('Preview the member view'));
  if(role.manager)assert(live.html.includes('/admin/events?event=event-id'));
  if(role.creator&&!role.host)assert(!live.html.includes('Manage your event'));
  const preview=await renderPage(role,{preview:true,confirmed:true});
  if(Object.values(role).some(Boolean)) {
    assert(preview.html.includes('Member preview · read-only'));
    assert(!preview.html.includes('HIDDEN_QUESTION'));assert(preview.html.includes('VISIBLE_QUESTION'));
    for(const component of ['booking','community-join','invites','feedback','attendees','follow-up','archive'])assert(!preview.mounted.includes(component),`Preview mounted ${component}`);
    for(const table of ['event_memberships','orders','registration_requests','menu_item_feedback'])assert(!preview.calls.some(call=>call.table===table),`Preview queried ${table}`);
    for(const rpc of ['list_my_table_invitations','get_my_event_intro_card','get_my_member_event_archive'])assert(!preview.calls.some(call=>call.rpc===rpc),`Preview queried ${rpc}`);
    assert(!preview.html.includes('Manage poster'));assert(!preview.html.includes('data-component="booking"'));
  } else {
    assert(!preview.html.includes('Member preview · read-only'),'ordinary query string must not create privileged preview');
  }
}
const failed=await renderPage({host:true,creator:true},{fail:true,preview:true});assert(failed.html.includes('We could not check your event access.'));assert(!failed.mounted.includes('booking'));assert(!failed.mounted.includes('invites'));
const attendee=await renderPage({},{confirmed:true});assert(attendee.html.includes('Open my event pass'));assert(attendee.html.includes('Open introductions'));assert(attendee.mounted.includes('attendees'));
const guest=await renderPage({},{confirmed:true,active:false});assert(guest.html.includes('Open my event pass'));assert(guest.html.includes('Open introductions'));assert(!guest.mounted.includes('attendees'));
console.log('Event viewer L1 passed: creator/Host/Admin/member/past-Host/error matrix, actual full-page render, canonical creator lookup, no preview private-account reads or mutable widgets, and guarded read-only question handlers. Live session/device acceptance separate.');
