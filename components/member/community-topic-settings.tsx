"use client";

import {useMemo,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {memberErrorMessage} from "@/lib/member-error";
import {communityConversationTopics} from "@/lib/community-conversation-topics";
import {ActionFeedback,useActionFeedback} from "@/components/ui/action-feedback";

export function CommunityTopicSettings({communityId,initialTopics,ready}:{communityId:string;initialTopics:string[];ready:boolean}) {
  const router=useRouter();const supabase=useMemo(()=>createClient(),[]);
  const [topics,setTopics]=useState(initialTopics);const [saved,setSaved]=useState(initialTopics);
  const [busy,setBusy]=useState(false);const {feedback,setMessage}=useActionFeedback();
  const dirty=topics.length!==saved.length||topics.some(topic=>!saved.includes(topic));
  async function save(event:FormEvent) {
    event.preventDefault();if(busy||!ready||!topics.length)return;
    setBusy(true);setMessage("");
    try {
      const {data,error}=await supabase.rpc("set_community_conversation_topics",{p_community_id:communityId,p_topics:topics});
      if(error)throw error;
      if(!Array.isArray(data)||!data.every(value=>typeof value==="string"))throw Error("The saved topics could not be confirmed. Refresh to check before saving again.");
      setSaved(data);setTopics(data);setMessage("Topics saved. Members can start conversations in the topics you selected.","success");router.refresh();
    }catch(error){setMessage(memberErrorMessage(error,"save your Community topics"));}finally{setBusy(false);}
  }
  return <section className="community-topic-settings" id="conversation-topics">
    <h2>Choose your conversation topics</h2><p>Members choose one of these when starting a conversation. Turning a topic off stops new conversations there; existing conversations and replies stay available.</p>
    {!ready?<div role="status"><p>Topics could not load. Refresh this page to try again.</p><button className="button button-outline" type="button" onClick={()=>router.refresh()}>Try again</button></div>:<form onSubmit={save}>
      <fieldset disabled={busy}><legend>Topics members can post in</legend><div className="community-topic-options">{communityConversationTopics.map(topic=><label key={topic.value}><input type="checkbox" checked={topics.includes(topic.value)} onChange={event=>{setMessage("");setTopics(current=>event.target.checked?[...current,topic.value]:current.filter(value=>value!==topic.value));}}/><span>{topic.label}</span></label>)}</div></fieldset>
      <small>Keep at least one topic. Start here and Announcements remain Host-only.</small>
      <div className="community-topic-settings-actions"><button className="button button-primary" disabled={busy||!dirty||!topics.length}>{busy?"Saving…":"Save topics"}</button>{dirty?<button className="button button-outline" type="button" disabled={busy} onClick={()=>{setTopics(saved);setMessage("");}}>Undo changes</button>:null}</div>
      {!topics.length?<p role="status">Choose at least one topic before saving.</p>:null}<ActionFeedback value={feedback}/>
    </form>}
  </section>;
}
