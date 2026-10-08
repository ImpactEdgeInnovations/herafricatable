import {createClient} from "@supabase/supabase-js";

// Read-only preflight: no provisioning, publication, posts, invitations or role changes.
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password=process.env.HAT_COMMUNITY_TEST_PASSWORD;
const slug=process.env.HAT_COMMUNITY_TEST_SLUG;
if(!url||!key||!password||!slug)throw Error("Set the public Supabase credentials, HAT_COMMUNITY_TEST_PASSWORD and an explicit HAT_COMMUNITY_TEST_SLUG. No secret key is needed.");
const identities=[
  ["host","community.host@hat-test.invalid","owner"],
  ["member-one","community.member.one@hat-test.invalid","member"],
  ["member-two","community.member.two@hat-test.invalid","member"],
  ["moderator","community.moderator@hat-test.invalid","moderator"],
  ["scale-member","community.scale@hat-test.invalid","member"],
];
const rows=[];
async function conversationReads(client,communityId){
  const seen=new Set();let cursor=null;let pages=0;let replies=0;let complete=false;
  for(;pages<10;){
    const result=await client.rpc("list_community_conversation_page",{p_community_id:communityId,p_limit:21,p_before_activity_at:cursor?.activityAt??null,p_before_pinned:cursor?.pinned??null,p_before_post_id:cursor?.postId??null});
    if(result.error)return {read_access:"denied or unavailable",pages,conversations:seen.size};
    const items=result.data??[];const visible=items.slice(0,20);pages++;
    for(const post of visible){if(seen.has(post.post_id))throw Error("Repeated cursor page");seen.add(post.post_id);}
    if(visible.length){
      const comments=await client.rpc("list_community_comments_for_posts",{p_community_id:communityId,p_post_ids:visible.map(post=>post.post_id),p_limit:500});
      if(comments.error)return {read_access:"reply check unavailable",pages,conversations:seen.size};
      replies+=(comments.data??[]).length;
    }
    if(items.length<=20){complete=true;break;}
    const last=visible.at(-1);cursor={activityAt:last.cursor_activity_at??last.created_at,pinned:Boolean(last.is_pinned),postId:last.post_id};
  }
  const search=await client.rpc("search_community_conversation_page",{p_community_id:communityId,p_limit:21,p_before_activity_at:null,p_before_pinned:null,p_before_post_id:null,p_category:null,p_search:"rehearsal",p_view:"all"});
  return {read_access:complete?"passed":"page limit reached",pages,conversations:seen.size,replies,search:search.error?"unavailable":"passed",scale_data_ready:complete&&seen.size>=45&&pages>=3};
}
for(const [identity,email,expectedRole] of identities){
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let signedIn=false;
  try {
    const auth=await client.auth.signInWithPassword({email,password});
    if(auth.error||!auth.data.user){rows.push({identity,sign_in:"failed",ready:false});continue;}
    signedIn=true;
    const result=await client.rpc("list_communities");
    if(result.error){rows.push({identity,sign_in:"passed",community_list:"failed",ready:false});continue;}
    const room=(result.data??[]).find(item=>item.slug===slug);
    if(!room){rows.push({identity,sign_in:"passed",room:"not visible",ready:false});continue;}
    const reads=room.membership_status==="active"?await conversationReads(client,room.community_id):{read_access:"inactive"};
    const ready=room.status==="published"&&room.membership_status==="active"&&room.membership_role===expectedRole&&reads.read_access==="passed"&&reads.search==="passed"&&reads.scale_data_ready;
    rows.push({identity,sign_in:"passed",room_status:room.status,membership_status:room.membership_status,role:room.membership_role,...reads,ready});
  }catch{rows.push({identity,check:"failed",ready:false});}
  finally{if(signedIn)await client.auth.signOut({scope:"local"}).catch(()=>{});}
}
console.log(JSON.stringify({checked_at:new Date().toISOString(),community_slug:slug,mode:"read-only",accounts:rows,ready:rows.every(row=>row.ready),note:"A ready preflight is not conversation, private-media, OTP or browser acceptance."},null,2));
if(!rows.every(row=>row.ready))process.exitCode=2;
