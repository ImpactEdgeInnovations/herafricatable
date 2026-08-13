"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

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
}: {
  attendees: CommunityGatheringAttendee[];
  communityId: string;
  currentUserId: string;
  eventId: string;
  messages: CommunityGatheringMessage[];
  reminderWindow: "day_before" | "hour_before" | null;
  questions: CommunityGatheringQuestion[];
  room: CommunityGatheringRoomState;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { ask, dialog } = useActionDialog();
  const [room, setRoom] = useState(initialRoom);
  const [messages, setMessages] = useState(initialMessages);
  const [questions, setQuestions] = useState(initialQuestions);
  const [attendees, setAttendees] = useState(initialAttendees);
  const [body, setBody] = useState("");
  const [question, setQuestion] = useState("");
  const [recap, setRecap] = useState(initialRoom.recap_body ?? "");
  const [discoverable, setDiscoverable] = useState(initialRoom.my_discoverable);
  const [reminderWindow, setReminderWindow] = useState(initialReminderWindow ?? "");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const questionsOpen = Date.now() >= new Date(room.questions_open_at).getTime()
    && Date.now() <= new Date(room.chat_closes_at).getTime();
  const canWrite = room.chat_phase === "open"
    && room.chat_mode !== "closed"
    && (room.can_manage || room.my_rsvp === "going");

  async function refreshRoom() {
    const [{ data: messageData }, { data: questionData }, { data: attendeeData }] = await Promise.all([
      supabase.rpc("list_community_gathering_messages", { p_limit: 200, p_room_id: room.room_id }),
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
    const { error } = await supabase.rpc("send_community_gathering_message", { p_body: body, p_room_id: room.room_id });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, "send your message"));
    setBody(""); await refreshRoom();
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
    const { error } = await supabase.rpc("manage_community_gathering_message", { p_action: action, p_message_id: item.message_id });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, `${action} this message`));
    await refreshRoom();
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
    event.preventDefault(); setBusy("settings"); setNotice("");
    const data = new FormData(event.currentTarget);
    const { error } = await supabase.rpc("save_community_gathering_settings", {
      p_chat_mode: String(data.get("chat_mode")), p_gathering_kind: String(data.get("gathering_kind")),
      p_meeting_provider: String(data.get("meeting_provider")) || null,
      p_meeting_url: String(data.get("meeting_url")) || null, p_room_id: room.room_id,
    });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, "save gathering settings"));
    setNotice("Gathering settings saved."); router.refresh();
  }

  async function publishRecap(event: FormEvent) {
    event.preventDefault(); setBusy("recap"); setNotice("");
    const { error } = await supabase.rpc("publish_community_gathering_recap", { p_body: recap, p_room_id: room.room_id });
    setBusy("");
    if (error) return setNotice(memberErrorMessage(error, "publish the recap"));
    setRoom((current) => ({ ...current, recap_body: recap, recap_published_at: current.recap_published_at ?? new Date().toISOString() }));
    setNotice("Recap published to Community Conversations.");
  }

  const timezone = room.timezone || "Africa/Nairobi";
  return (
    <div className="gathering-room">
      {dialog}
      <header className="gathering-room-hero">
        <Link href={`/communities/${room.community_slug}?view=gatherings`}>← All gatherings</Link>
        <div className="gathering-room-status"><span className={`is-${room.chat_phase}`}>{room.chat_phase === "open" ? "Conversation open" : room.chat_phase === "archived" ? "Gathering archive" : "Upcoming gathering"}</span><span>{plainLabel(room.gathering_kind)}</span></div>
        <h1>{room.title}</h1>
        <p>{room.summary || "A thoughtful place to meet and spend time together."}</p>
        <dl>
          <div><dt>When</dt><dd>{new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(new Date(room.starts_at))}</dd></div>
          <div><dt>Where</dt><dd>{room.city ? [room.venue_name, room.city, room.country].filter(Boolean).join(", ") : plainLabel(room.format)}</dd></div>
          <div><dt>Going</dt><dd>{Number(room.going_count)} members</dd></div>
        </dl>
        <div className="gathering-rsvp">
          {new Date(room.ends_at).getTime() > Date.now() ? <>
            <button className={room.my_rsvp === "going" ? "button button-primary" : "button button-outline"} disabled={busy === "rsvp"} onClick={() => void saveRsvp("going")} type="button">I’m going</button>
            <button disabled={busy === "rsvp"} onClick={() => void saveRsvp("not_going")} type="button">I can’t make it</button>
            <label><input checked={discoverable} onChange={(event) => setDiscoverable(event.target.checked)} type="checkbox" /> Let other attendees see me</label>
            {room.my_rsvp === "going" ? <label className="gathering-reminder">Remind me<select aria-label="Gathering reminder" disabled={busy === "reminder"} onChange={(event) => void saveReminder(event)} value={reminderWindow}><option value="">No reminder</option><option value="day_before">One day before</option><option value="hour_before">One hour before</option></select></label> : null}
          </> : null}
          {room.meeting_url ? <a className="button button-primary" href={room.meeting_url} rel="noopener noreferrer" target="_blank">Join online gathering ↗</a> : room.format !== "in_person" && room.my_rsvp === "going" ? <small>The private joining link appears here 30 minutes before the gathering.</small> : null}
        </div>
        {notice ? <p className="form-message" role="status">{notice}</p> : null}
      </header>

      <nav className="gathering-room-jump" aria-label="Gathering areas">
        <a href="#questions">Questions</a><a href="#live-conversation">Live conversation</a><a href="#attendees">People going</a>{room.can_manage ? <a href="#host-settings">Host settings</a> : null}
      </nav>

      <div className="gathering-room-layout">
        <section className="gathering-questions" id="questions">
          <header><div><p className="eyebrow">Before we meet</p><h2>Questions for the room</h2></div><p>Share what you hope the Host or guest will cover. Support a question instead of repeating it.</p></header>
          {questionsOpen ? <form onSubmit={sendQuestion}><label htmlFor="gathering-question">What would you like discussed?</label><textarea id="gathering-question" maxLength={600} minLength={10} onChange={(event) => setQuestion(event.target.value)} placeholder="I would value a practical discussion about…" rows={3} value={question}/><button className="button button-primary" disabled={busy === "question" || question.trim().length < 10} type="submit">Share question</button></form> : <p className="gathering-soft-note">Questions open seven days before the gathering.</p>}
          <div className="gathering-question-list">{questions.map((item) => <article key={item.question_id}><div><strong>{item.author_name || "Community member"}</strong><span>{item.question_status === "answered" ? "Answered" : "Open"}</span></div><p>{item.body}</p><footer><button className={item.supported_by_me ? "is-supported" : ""} disabled={busy === item.question_id} onClick={() => void supportQuestion(item)} type="button">Useful question · {Number(item.support_count)}</button>{room.can_manage && item.question_status === "open" ? <><button onClick={() => void reviewQuestion(item.question_id, "answered")} type="button">Mark answered</button><button onClick={() => void reviewQuestion(item.question_id, "dismissed")} type="button">Hide</button></> : null}</footer></article>)}</div>
        </section>

        <section className="gathering-live" id="live-conversation">
          <header><div><p className="eyebrow">Around the gathering</p><h2>Live conversation</h2></div><p>{room.chat_phase === "before" ? `Opens ${new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(room.chat_opens_at))}.` : room.chat_phase === "open" ? "Open now. Keep messages useful, kind and connected to this gathering." : "This room is now read-only. The lasting summary appears in Community Conversations."}</p></header>
          {messages.length ? <div className="gathering-message-list" aria-live="polite">{messages.map((item) => { const authorName = item.author_name || "Community member"; return <article className={item.is_pinned ? "is-pinned" : ""} key={item.message_id}><div className="gathering-message-avatar">{item.author_avatar_url ? <img alt="" src={item.author_avatar_url}/> : authorName.slice(0, 1)}</div><div><header><strong>{authorName}</strong>{item.is_pinned ? <span>Pinned</span> : null}<time>{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(item.created_at))}</time></header><p>{item.body}</p><footer>{room.can_manage ? <><button disabled={busy === item.message_id} onClick={() => void moderateMessage(item, item.is_pinned ? "unpin" : "pin")} type="button">{item.is_pinned ? "Unpin" : "Pin"}</button><button onClick={() => void moderateMessage(item, "remove")} type="button">Remove</button></> : item.author_id !== currentUserId ? <button onClick={() => void reportMessage(item)} type="button">Report privately</button> : null}</footer></div></article>; })}</div> : <div className="gathering-soft-note"><strong>No messages yet.</strong><p>The Host can welcome everyone when the room opens.</p></div>}
          {canWrite ? <form className="gathering-message-composer" onSubmit={sendMessage}><label htmlFor="gathering-message">Add to the live conversation</label><div><textarea id="gathering-message" maxLength={600} onChange={(event) => setBody(event.target.value)} placeholder="Share a thought or useful link…" rows={2} value={body}/><button className="button button-primary" disabled={busy === "message" || body.trim().length < 2} type="submit">Send</button></div><small>{room.chat_mode === "slow" ? "Slow mode is on: one message every 30 seconds." : "This conversation becomes read-only 24 hours after the gathering."}</small></form> : room.chat_phase === "open" && room.my_rsvp !== "going" && !room.can_manage ? <p className="gathering-soft-note">Choose “I’m going” above to take part in the live conversation.</p> : null}
        </section>

        <aside className="gathering-attendees" id="attendees"><p className="eyebrow">People going</p><h2>Meet before you arrive.</h2><p>Only members who chose to be visible appear here.</p>{attendees.length ? <div>{attendees.map((person) => { const name = person.display_name || "Community member"; return <Link href={`/members/${person.user_id}`} key={person.user_id}><span>{person.avatar_url ? <img alt="" src={person.avatar_url}/> : name.slice(0, 1)}</span><span><strong>{name}</strong><small>{[person.job_title, person.company].filter(Boolean).join(" · ") || "Community member"}</small></span></Link>; })}</div> : <p className="gathering-soft-note">No one has chosen to appear here yet.</p>}</aside>
      </div>

      {room.can_manage ? <section className="gathering-host-settings" id="host-settings"><header><p className="eyebrow">Private Host tools</p><h2>Prepare this gathering</h2><p>Use an external video service for calls. The private link is only shown to members who are going, from 30 minutes before until one hour after.</p></header><form onSubmit={saveSettings}><label>Gathering style<select defaultValue={room.gathering_kind} name="gathering_kind"><option value="community_catch_up">Community catch-up</option><option value="networking_circle">Networking circle</option><option value="workshop">Workshop</option><option value="guest_conversation">Guest conversation</option><option value="webinar">Online gathering</option><option value="accountability_session">Accountability session</option><option value="social_wellbeing">Social & wellbeing</option></select></label><label>Video service<select defaultValue={room.meeting_provider ?? ""} name="meeting_provider"><option value="">No online link</option><option value="google_meet">Google Meet</option><option value="zoom">Zoom</option><option value="microsoft_teams">Microsoft Teams</option><option value="other">Other secure link</option></select></label><label>Private joining link<input defaultValue={room.meeting_url ?? ""} name="meeting_url" placeholder="https://meet.google.com/…" type="url"/></label><label>Live conversation<select defaultValue={room.chat_mode} name="chat_mode"><option value="open">Open to people going</option><option value="slow">Slow mode</option><option value="hosts_only">Pause members; Hosts only</option><option value="closed">Closed</option></select></label><button className="button button-primary" disabled={busy === "settings"} type="submit">Save gathering settings</button></form></section> : null}

      {(room.can_manage || room.recap_body) ? <section className="gathering-recap"><header><p className="eyebrow">After the gathering</p><h2>{room.recap_published_at ? "The Community recap" : "Bring the useful parts back"}</h2><p>A short Host-reviewed recap keeps the permanent Community feed calm and useful.</p></header>{room.can_manage ? <form onSubmit={publishRecap}><label htmlFor="gathering-recap">What should members remember or do next?</label><textarea id="gathering-recap" maxLength={2800} minLength={20} onChange={(event) => setRecap(event.target.value)} placeholder="We discussed… The most useful next steps are…" rows={7} value={recap}/><button className="button button-primary" disabled={busy === "recap" || recap.trim().length < 20} type="submit">{room.recap_published_at ? "Update recap" : "Publish to Conversations"}</button></form> : <div className="gathering-recap-body"><p>{room.recap_body}</p><Link href={`/communities/${room.community_slug}?view=conversations`}>Continue in Conversations →</Link></div>}</section> : null}
    </div>
  );
}
