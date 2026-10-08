"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";
import { CommunityGatheringVideo, type GatheringVideo } from "@/components/member/community-gathering-video";
import { CommunityGatheringDiscussion } from "@/components/member/community-gathering-discussion";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";

export type CommunityGatheringRoomState = {
  room_id: string;
  community_name: string;
  community_slug: string;
  event_slug: string;
  title: string;
  summary: string | null;
  format: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  gathering_kind: string;
  meeting_provider: string | null;
  meeting_url: string | null;
  questions_open_at: string;
  chat_opens_at: string;
  chat_closes_at: string;
  chat_mode: "open" | "slow" | "hosts_only" | "closed";
  chat_phase: "before" | "open" | "archived" | "closed";
  my_rsvp: "going" | "not_going" | null;
  my_discoverable: boolean;
  can_manage: boolean;
  going_count: number;
  recap_body: string | null;
  recap_published_at: string | null;
};

export type CommunityGatheringMessage = {
  message_id: string;
  author_id: string;
  author_name: string | null;
  author_avatar_url: string | null;
  body: string;
  is_pinned: boolean;
  created_at: string;
  reply_to?: { author_name: string | null; body: string } | null;
};

export type CommunityGatheringQuestion = {
  question_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  question_status: "open" | "answered";
  support_count: number;
  supported_by_me: boolean;
  created_at: string;
};

export type CommunityGatheringAttendee = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  company: string | null;
};

function plainLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CommunityGatheringRoom({
  attendees: initialAttendees,
  communityId,
  currentUserId,
  eventId,
  messages: initialMessages,
  reminderWindow: initialReminderWindow,
  questions: initialQuestions,
  room: initialRoom,
  video,
  videoReady,
  embedded = false,
  contentKind = "scheduled",
}: {
  attendees: CommunityGatheringAttendee[];
  communityId: string;
  currentUserId: string;
  eventId: string;
  messages: CommunityGatheringMessage[];
  reminderWindow: "day_before" | "hour_before" | null;
  questions: CommunityGatheringQuestion[];
  room: CommunityGatheringRoomState;
  video: GatheringVideo | null;
  videoReady: boolean;
  embedded?: boolean;
  contentKind?: "scheduled" | "prerecorded";
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { ask, dialog } = useActionDialog();
  const [room, setRoom] = useState(initialRoom);
  const [messages, setMessages] = useState(initialMessages);
  const [questions, setQuestions] = useState(initialQuestions);
  const [attendees, setAttendees] = useState(initialAttendees);
  const [body, setBody] = useCommunityDraft(communityDraftKey(currentUserId, "gathering-message", initialRoom.room_id), "");
  const [replyTo, setReplyTo] = useState<CommunityGatheringMessage | null>(null);
  const chatComposer = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useCommunityDraft(communityDraftKey(currentUserId, "gathering-question", initialRoom.room_id), "");
  const [recap, setRecap, clearRecap] = useCommunityDraft(communityDraftKey(currentUserId, "gathering-recap", initialRoom.room_id), initialRoom.recap_body ?? "");
  const initialSettings = { gatheringKind: initialRoom.gathering_kind, meetingProvider: initialRoom.meeting_provider ?? "", meetingUrl: initialRoom.meeting_url ?? "", chatMode: initialRoom.chat_mode };
  const [settingsDraft, setSettingsDraft, clearSettingsDraft] = useCommunityDraft(communityDraftKey(currentUserId, "gathering-settings", initialRoom.room_id), initialSettings);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const settingsDirty = JSON.stringify(settingsDraft) !== JSON.stringify(savedSettings);
  const [discoverable, setDiscoverable] = useState(initialRoom.my_discoverable);
  const [reminderWindow, setReminderWindow] = useState(initialReminderWindow ?? "");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [videoRevision, setVideoRevision] = useState(0);
  const [hostToolsOpen, setHostToolsOpen] = useState(false);
  const questionsOpen = Date.now() >= new Date(room.questions_open_at).getTime()
    && Date.now() <= new Date(room.chat_closes_at).getTime();
  const canWrite = room.chat_phase === "open"
    && room.chat_mode !== "closed"
    && (room.chat_mode !== "hosts_only" || room.can_manage)
    && (room.can_manage || room.my_rsvp === "going");

  async function refreshRoom() {
    const [{ data: messageData }, { data: questionData }, { data: attendeeData }] = await Promise.all([
      supabase.rpc("list_community_gathering_chat", { p_room_id: room.room_id }),
      supabase.rpc("list_community_gathering_questions", { p_room_id: room.room_id }),
      supabase.rpc("list_community_gathering_attendees", { p_room_id: room.room_id }),
    ]);
    if (messageData) setMessages(messageData as CommunityGatheringMessage[]);
    if (questionData) setQuestions(questionData as CommunityGatheringQuestion[]);
    if (attendeeData) setAttendees(attendeeData as CommunityGatheringAttendee[]);
  }

  useEffect(() => {
    const channel = supabase.channel(`gathering:${room.room_id}`)
      .on("postgres_changes", {
        event: "*", filter: `room_id=eq.${room.room_id}`,
        schema: "public", table: "community_gathering_messages",
      }, () => { void refreshRoom(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.room_id, supabase]);

  async function saveRsvp(status: "going" | "not_going") {
    setBusy("rsvp"); setNotice("");
    const { error } = await supabase.rpc("set_community_gathering_rsvp", {
      p_discoverable: status === "going" && discoverable,
      p_room_id: room.room_id, p_status: status,
    });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, "save your response"));
    setRoom((current) => ({ ...current, my_rsvp: status, my_discoverable: status === "going" && discoverable }));
    setNotice(status === "going" ? "Your place is saved." : "Thanks for letting the Host know.");
    router.refresh();
  }

  async function saveReminder(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as "" | "day_before" | "hour_before";
    const previous = reminderWindow;
    setReminderWindow(next);
    setBusy("reminder"); setNotice("");
    const { error } = await supabase.rpc("set_my_community_event_reminder", {
      p_community_id: communityId,
      p_event_id: eventId,
      p_reminder_window: next || null,
    });
    setBusy("");
    if (error) {
      setReminderWindow(previous);
      return setNotice(memberErrorMessage(error, "save your reminder"));
    }
    setNotice(next ? "Your reminder is saved." : "Your reminder was removed.");
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy("message"); setNotice("");
    try {
    const { error } = replyTo ? await supabase.rpc("reply_to_community_gathering_message", { p_body: body, p_room_id: room.room_id, p_reply_to_message_id: replyTo.message_id }) : await supabase.rpc("send_community_gathering_message", { p_body: body, p_room_id: room.room_id });
    if (error) throw error;
    setBody(""); setReplyTo(null); await refreshRoom();
    } catch (cause) { setNotice(memberErrorMessage(cause, "send your message")); }
    finally { setBusy(""); }
  }

  async function sendQuestion(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setBusy("question"); setNotice("");
    const { error } = await supabase.rpc("submit_community_gathering_question", { p_body: question, p_room_id: room.room_id });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, "share your question"));
    setQuestion(""); await refreshRoom();
    setNotice("Your question is now in the room.");
  }

  async function supportQuestion(item: CommunityGatheringQuestion) {
    setBusy(item.question_id);
    const { error } = await supabase.rpc("toggle_community_gathering_question_support", { p_question_id: item.question_id });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, "support this question"));
    setQuestions((current) => current.map((candidate) => candidate.question_id === item.question_id ? {
      ...candidate,
      support_count: Math.max(0, Number(candidate.support_count) + (candidate.supported_by_me ? -1 : 1)),
      supported_by_me: !candidate.supported_by_me,
    } : candidate));
  }

  async function moderateMessage(item: CommunityGatheringMessage, action: "pin" | "unpin" | "remove") {
    if (action === "remove") {
      const confirmed = await ask({
        confirmLabel: "Remove message", description: "It will disappear from the gathering and the action will be recorded.",
        title: "Remove this message?", tone: "danger",
      });
      if (!confirmed) return;
    }
    setBusy(item.message_id);
    try {
      const result = action === "remove" && item.author_id === currentUserId && !room.can_manage
        ? await supabase.rpc("remove_my_community_gathering_message", { p_message_id:item.message_id })
        : await supabase.rpc("manage_community_gathering_message", { p_action: action, p_message_id: item.message_id });
      if (result.error) throw result.error;
      if (action === "remove" && replyTo?.message_id === item.message_id) setReplyTo(null);
      await refreshRoom();
      setNotice(action === "remove" ? "Message removed." : action === "pin" ? "Message pinned." : "Message unpinned.");
    } catch (cause) { setNotice(memberErrorMessage(cause, `${action} this message`)); }
    finally { setBusy(""); }
  }

  async function reportMessage(item: CommunityGatheringMessage) {
    const result = await ask({
      confirmLabel: "Send private report",
      description: "The safety team receives a protected copy of the message and your explanation.",
      fields: [
        { initialValue: "safety", label: "Reason", name: "reason", options: [
          { label: "Safety concern", value: "safety" }, { label: "Harassment", value: "harassment" },
          { label: "Privacy", value: "privacy" }, { label: "Spam", value: "spam" }, { label: "Other", value: "other" },
        ], type: "select" },
        { label: "What happened?", maxLength: 1000, minLength: 10, name: "details", required: true, type: "textarea" },
      ], title: "Report this message", tone: "danger",
    });
    if (!result) return;
    const { error } = await supabase.rpc("report_community_gathering_message", {
      p_details: String(result.details), p_message_id: item.message_id, p_reason: String(result.reason),
    });
    setNotice(error ? memberErrorMessage(error, "send your report") : "Your report was sent privately.");
  }

  async function reviewQuestion(id: string, status: "answered" | "dismissed") {
    setBusy(id);
    const { error } = await supabase.rpc("review_community_gathering_question", { p_question_id: id, p_status: status });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, "update this question"));
    await refreshRoom();
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room.can_manage || busy === "settings" || !settingsDirty) return;
    setBusy("settings"); setNotice("");
    const submitted = { ...settingsDraft };
    try {
    const { error } = await supabase.rpc("save_community_gathering_settings", {
      p_chat_mode: submitted.chatMode, p_gathering_kind: submitted.gatheringKind,
      p_meeting_provider: submitted.meetingProvider || null,
      p_meeting_url: submitted.meetingUrl || null, p_room_id: room.room_id,
    });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, "save gathering settings"));
    setSavedSettings(submitted); clearSettingsDraft(submitted);
    setRoom(current => ({ ...current, gathering_kind: submitted.gatheringKind, meeting_provider: submitted.meetingProvider || null, meeting_url: submitted.meetingUrl || null, chat_mode: submitted.chatMode }));
    setNotice("Gathering settings saved."); router.refresh();
    } catch (error) { setNotice(memberErrorMessage(error, "save gathering settings")); }
    finally { setBusy(""); }
  }

  async function publishRecap(event: FormEvent) {
    event.preventDefault(); setBusy("recap"); setNotice("");
    const { error } = await supabase.rpc("publish_community_gathering_recap", { p_body: recap, p_room_id: room.room_id });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, "publish the recap"));
    setRoom((current) => ({ ...current, recap_body: recap, recap_published_at: current.recap_published_at ?? new Date().toISOString() }));
    clearRecap(recap);
    setNotice("Recap published to Community Conversations.");
  }

  const timezone = room.timezone || "Africa/Nairobi";
  const isRecording = contentKind === "prerecorded";
  const Heading = embedded ? "h2" : "h1";
  return (
    <div className={`gathering-room${isRecording ? " is-recording" : ""}`}>
      {dialog}
      <header className="gathering-room-hero">
        {!embedded ? <Link href={`/communities/${room.community_slug}?view=gatherings`}>← All gatherings</Link> : null}
        <div className="gathering-room-status"><span className={`is-${room.chat_phase}`}>{isRecording ? "Video discussion" : room.chat_phase === "open" ? "Conversation open" : room.chat_phase === "archived" ? "Gathering archive" : "Upcoming gathering"}</span>{!isRecording ? <span>{plainLabel(room.gathering_kind)}</span> : null}</div>
        <Heading>{room.title}</Heading>
        <p>{room.summary || "A thoughtful place to meet and spend time together."}</p>
        <dl>
          <div><dt>{isRecording ? "Added" : "When"}</dt><dd>{new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: isRecording ? undefined : "short", timeZone: timezone }).format(new Date(room.starts_at))}</dd></div>
          <div><dt>Where</dt><dd>{room.city ? [room.venue_name, room.city, room.country].filter(Boolean).join(", ") : plainLabel(room.format)}</dd></div>
        </dl>
        <div className="gathering-rsvp">
          {!isRecording && new Date(room.ends_at).getTime() > Date.now() ? <>
            <button className={room.my_rsvp === "going" ? "button button-primary" : "button button-outline"} disabled={busy === "rsvp"} onClick={() => void saveRsvp("going")} type="button">I’m going</button>
            {room.my_rsvp === "going" ? <button disabled={busy === "rsvp"} onClick={() => void saveRsvp("not_going")} type="button">I can’t make it</button> : null}
            <label><input checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} type="checkbox" /> Let other attendees see me</label>
            {room.my_rsvp === "going" ? <label className="gathering-reminder">Remind me<select aria-label="Gathering reminder" disabled={busy === "reminder"} onChange={(event) => void saveReminder(event)} value={reminderWindow}><option value="">No reminder</option><option value="day_before">One day before</option><option value="hour_before">One hour before</option></select></label> : null}
          </> : null}
          {room.meeting_url ? <a className="button button-primary" href={room.meeting_url} rel="noopener noreferrer" target="_blank">Join online gathering ↗</a> : room.format !== "in_person" && room.my_rsvp === "going" ? <small>The private joining link appears here 30 minutes before the gathering.</small> : null}
        </div>
        {notice ? <p className="form-message" role="status">{notice}</p> : null}
      </header>

      <nav hidden={isRecording} className="gathering-room-jump" aria-label="Gathering areas">
        <a href="#questions">Questions</a><a href="#live-conversation">Conversation</a>{attendees.length ? <a href="#attendees">Meet members</a> : null}{room.can_manage ? <a href="#host-settings" onClick={()=>setHostToolsOpen(true)}>Host tools</a> : null}
      </nav>

      <div className="gathering-room-layout gathering-watch-layout">
        <CommunityGatheringVideo roomId={room.room_id} canManage={room.can_manage}
          endsAt={room.ends_at} title={room.title} initialVideo={video} ready={videoReady} currentUserId={currentUserId} onSaved={() => setVideoRevision(value => value + 1)} />
        <CommunityGatheringDiscussion roomId={room.room_id} currentUserId={currentUserId} revision={videoRevision} />
        <section hidden={isRecording} className="gathering-questions" id="questions">
          <header><div><p className="eyebrow">Before we meet</p><h2>Questions</h2></div><p>Ask the Host a question, or support one already shared.</p></header>
          {questionsOpen ? <form onSubmit={sendQuestion}><label htmlFor="gathering-question">What would you like discussed?</label><textarea id="gathering-question" maxLength={600} minLength={10} onChange={(event) => setQuestion(event.target.value)} placeholder="I would value a practical discussion about…" rows={3} value={question}/><button className="button button-primary" disabled={busy === "question" || question.trim().length < 10} type="submit">Share question</button></form> : <p className="gathering-soft-note">You can ask questions from {new Intl.DateTimeFormat("en-KE", {dateStyle:"medium", timeZone:timezone}).format(new Date(room.questions_open_at))}.</p>}
          <div className="gathering-question-list">{questions.map((item) => <article key={item.question_id}><div><strong>{item.author_name || "Community member"}</strong><span>{item.question_status === "answered" ? "Answered" : "Open"}</span></div><p>{item.body}</p><footer><button className={item.supported_by_me ? "is-supported" : ""} disabled={busy === item.question_id} onClick={() => void supportQuestion(item)} type="button">Useful question · {Number(item.support_count)}</button>{room.can_manage && item.question_status === "open" ? <><button onClick={() => void reviewQuestion(item.question_id, "answered")} type="button">Mark answered</button><button onClick={() => void reviewQuestion(item.question_id, "dismissed")} type="button">Hide</button></> : null}</footer></article>)}</div>
        </section>

        <section hidden={isRecording} className="gathering-live" id="live-conversation">
          <header><div><p className="eyebrow">Around the gathering</p><h2>Live conversation</h2></div><p>{room.chat_phase === "before" ? `Opens ${new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(room.chat_opens_at))}.` : room.chat_phase === "open" ? "Open now. Keep messages useful, kind and connected to this gathering." : "This room is now read-only. Messages stay here with the gathering."}</p></header>
          {messages.length ? <div className="gathering-message-list" role="region" aria-label="Live messages" tabIndex={0}>{messages.map((item) => {
            const authorName = item.author_name || "Community member";
            return <article className={item.is_pinned ? "is-pinned" : ""} key={item.message_id}>
              <div className="gathering-message-avatar">{item.author_avatar_url ? <img alt="" src={item.author_avatar_url}/> : authorName.slice(0, 1)}</div>
              <div><header><strong>{authorName}</strong>{item.is_pinned ? <span>Pinned</span> : null}<time>{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(item.created_at))}</time></header>
                {item.reply_to ? <blockquote><strong>Reply to {item.reply_to.author_name || "a member"}</strong><p>{item.reply_to.body}</p></blockquote> : null}<p>{item.body}</p>
                <footer>{canWrite ? <button type="button" onClick={() => { setReplyTo(item); chatComposer.current?.focus(); }}>Reply</button> : null}
                  <details><summary>More</summary>
                    {room.can_manage ? <>
                      <button disabled={busy === item.message_id} onClick={() => void moderateMessage(item, item.is_pinned ? "unpin" : "pin")} type="button">{item.is_pinned ? "Unpin" : "Pin"}</button>
                      <button disabled={busy === item.message_id} onClick={() => void moderateMessage(item, "remove")} type="button">Remove</button>
                    </> : item.author_id === currentUserId
                      ? <button disabled={busy === item.message_id} onClick={() => void moderateMessage(item, "remove")} type="button">Remove my message</button>
                      : <button onClick={() => void reportMessage(item)} type="button">Report privately</button>}
                  </details>
                </footer>
              </div>
            </article>;
          })}</div> : room.chat_phase === "open" ? <div className="gathering-soft-note"><strong>Start the conversation.</strong><p>Share a thought or say hello.</p></div> : null}
          {canWrite ? <form className="gathering-message-composer" onSubmit={sendMessage}>{replyTo ? <div className="gathering-reply-context"><span>Replying to {replyTo.author_name || "a member"}</span><button type="button" onClick={() => setReplyTo(null)}>Cancel reply</button></div> : null}<label htmlFor="gathering-message">Add a message</label><div><textarea ref={chatComposer} id="gathering-message" maxLength={600} onChange={(event) => setBody(event.target.value)} placeholder="Share a thought or useful link…" rows={2} value={body}/><button className="button button-primary" disabled={busy === "message" || body.trim().length < 2} type="submit">Send</button></div><small>{room.chat_mode === "slow" ? "Slow mode is on: one message every 30 seconds." : "This conversation becomes read-only 24 hours after the gathering."}</small></form> : room.chat_phase === "open" && room.chat_mode === "hosts_only" && !room.can_manage ? <p className="gathering-soft-note">The Host has paused member messages. You can still read the conversation.</p> : room.chat_phase === "open" && room.my_rsvp !== "going" && !room.can_manage ? <p className="gathering-soft-note">Choose “I’m going” above to take part in the live conversation.</p> : null}
        </section>

        <aside hidden={isRecording || !attendees.length} className="gathering-attendees" id="attendees"><p className="eyebrow">Meet members</p><h2>Meet before the gathering.</h2><p>Only members who chose to be visible appear here.</p>{attendees.length ? <div>{attendees.map((person) => { const name = person.display_name || "Community member"; return <Link href={`/members/${person.user_id}`} key={person.user_id}><span>{person.avatar_url ? <img alt="" src={person.avatar_url}/> : name.slice(0, 1)}</span><span><strong>{name}</strong><small>{[person.job_title, person.company].filter(Boolean).join(" · ") || "Community member"}</small></span></Link>; })}</div> : <p className="gathering-soft-note">No one has chosen to appear here yet.</p>}</aside>
      </div>

      {room.can_manage && !isRecording ? <details className="gathering-host-panel" id="host-settings" open={hostToolsOpen} onToggle={event=>setHostToolsOpen(event.currentTarget.open)}><summary>Host tools <small>Settings and attendance · only visible to Hosts</small></summary><section className="gathering-host-settings"><p className="gathering-host-attendance"><strong>{Number(room.going_count)} going</strong> · Only Hosts see this total.</p><header><p className="eyebrow">Private Host tools</p><h2>Prepare this gathering</h2><p>Use an external video service for calls. The private link is only shown to members who are going, from 30 minutes before until one hour after.</p></header><form onSubmit={saveSettings}><label>Gathering style<select value={settingsDraft.gatheringKind} disabled={busy === "settings"} onChange={event => setSettingsDraft(current => ({ ...current, gatheringKind: event.target.value }))} name="gathering_kind"><option value="community_catch_up">Community catch-up</option><option value="networking_circle">Networking circle</option><option value="workshop">Workshop</option><option value="guest_conversation">Guest conversation</option><option value="webinar">Online gathering</option><option value="accountability_session">Accountability session</option><option value="social_wellbeing">Social & wellbeing</option></select></label><label>Video service<select value={settingsDraft.meetingProvider} disabled={busy === "settings"} onChange={event => setSettingsDraft(current => ({ ...current, meetingProvider: event.target.value }))} name="meeting_provider"><option value="">No online link</option><option value="google_meet">Google Meet</option><option value="zoom">Zoom</option><option value="microsoft_teams">Microsoft Teams</option><option value="other">Other secure link</option></select></label><label>Private joining link<input value={settingsDraft.meetingUrl} disabled={busy === "settings"} onChange={event => setSettingsDraft(current => ({ ...current, meetingUrl: event.target.value }))} name="meeting_url" placeholder="https://meet.google.com/…" type="url"/></label><label>Live conversation<select value={settingsDraft.chatMode} disabled={busy === "settings"} onChange={event => setSettingsDraft(current => ({ ...current, chatMode: event.target.value as CommunityGatheringRoomState["chat_mode"] }))} name="chat_mode"><option value="open">Open to people going</option><option value="slow">Slow mode</option><option value="hosts_only">Pause members; Hosts only</option><option value="closed">Closed</option></select></label><button className="button button-primary" disabled={busy === "settings" || !settingsDirty} type="submit">Save gathering settings</button></form>{settingsDirty ? <p role="status">Changes are not saved yet. <button type="button" disabled={busy === "settings"} onClick={() => clearSettingsDraft(savedSettings)}>Discard changes</button></p> : null}</section></details> : null}

      {!isRecording && (room.can_manage || room.recap_body) ? <section className="gathering-recap"><header><p className="eyebrow">After the gathering</p><h2>{room.recap_published_at ? "The Community recap" : "Gathering recap"}</h2><p>Share a short summary and useful next steps after you meet.</p></header>{room.can_manage ? <details className="gathering-recap-editor"><summary>{room.recap_published_at ? "Edit recap" : "Write a recap"}</summary><form onSubmit={publishRecap}><label htmlFor="gathering-recap">What should members remember or do next?</label><textarea id="gathering-recap" maxLength={2800} minLength={20} onChange={(event) => setRecap(event.target.value)} placeholder="We discussed… The most useful next steps are…" rows={4} value={recap}/><button className="button button-primary" disabled={busy === "recap" || recap.trim().length < 20} type="submit">{room.recap_published_at ? "Update recap" : "Publish to Conversations"}</button></form></details> : <div className="gathering-recap-body"><p>{room.recap_body}</p><Link href={`/communities/${room.community_slug}?view=conversations`}>Continue in Conversations →</Link></div>}</section> : null}
    </div>
  );
}
