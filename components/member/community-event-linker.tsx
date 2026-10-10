"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

type EventOption = {
  item_type: string;
  item_id: string;
  title: string;
  summary: string | null;
  starts_at: string | null;
  format: string | null;
  is_linked: boolean;
  is_featured: boolean;
};

function eventTime(value: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return null;
  return `${new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(value))} EAT`;
}

export function CommunityEventLinker({ communityId, onCreateGathering }: {
  communityId: string;
  onCreateGathering: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { ask, dialog } = useActionDialog();
  const titleId = useId();
  const [options, setOptions] = useState<EventOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const actionBusy = useRef(false);
  const alive = useRef(true);

  async function readOptions() {
    const { data, error } = await supabase.rpc("list_community_programming_options", { p_community_id: communityId });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Event list unavailable");
    return (data as EventOption[]).filter(option => option.item_type === "event");
  }

  useEffect(() => {
    let active = true;
    alive.current = true;
    setStatus("loading");
    void readOptions().then(items => {
      if (!active) return;
      setOptions(items);
      setStatus("ready");
      setNeedsRefresh(false);
    }).catch(error => {
      if (!active) return;
      setStatus("error");
      setNotice(memberErrorMessage(error, "load events you can link"));
    });
    return () => { active = false; alive.current = false; };
  // The client is stable; revisions deliberately reload the authoritative list.
  }, [communityId, supabase, revision]);

  const selected = options.find(option => option.item_id === selectedId) ?? options[0];

  async function updateLink(option: EventOption, active: boolean) {
    if (actionBusy.current || status !== "ready" || needsRefresh) return;
    actionBusy.current = true;
    setBusy(true);
    setNotice("");
    try {
      if (!active) {
        const confirmed = await ask({
          title: `Unlink ${option.title}?`,
          description: "Members will no longer find this event in your Community. The event and its guest bookings will not be cancelled.",
          confirmLabel: "Unlink event",
          tone: "danger",
        });
        if (!confirmed || !alive.current) return;
      }
      const { error } = await supabase.rpc("set_community_event_link", {
        p_active: active,
        p_community_id: communityId,
        p_event_id: option.item_id,
        p_featured: active ? option.is_featured : false,
      });
      if (error) throw error;
      const latest = await readOptions();
      if (!alive.current) return;
      const saved = latest.find(item => item.item_id === option.item_id);
      if (!saved || saved.is_linked !== active) throw new Error("Link change was not confirmed");
      setOptions(latest);
      setNotice(active ? "Event linked. Members can find it in Gatherings." : "Event unlinked. The event and guest bookings are unchanged.");
      router.refresh();
    } catch {
      if (!alive.current) return;
      setNeedsRefresh(true);
      setNotice("We couldn’t confirm this change. Refresh the event list to check before trying again.");
    } finally {
      actionBusy.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <section className="community-inline-event-linker" aria-labelledby={titleId}>
    <header><h2 id={titleId}>Link an existing event</h2><p>Show an event in this Community. Members still choose whether to attend.</p></header>
    {status === "loading" ? <p role="status">Loading available events…</p> : status === "error" ? <div role="alert"><p>{notice}</p><button type="button" className="button button-outline" onClick={() => { setNotice(""); setRevision(value => value + 1); }}>Try again</button></div> : <>
      {notice ? <p role={needsRefresh ? "alert" : "status"}>{notice}</p> : null}
      {needsRefresh ? <button type="button" className="button button-outline" onClick={() => { setNotice(""); setRevision(value => value + 1); }}>Refresh event list</button> : null}
      {selected ? <div className="community-inline-event-choice">
        <label>Choose an event<select value={selected.item_id} disabled={busy || needsRefresh} onChange={event => { setSelectedId(event.target.value); setNotice(""); }}>{options.map(option => <option key={option.item_id} value={option.item_id}>{option.title}{option.is_linked ? " — linked" : ""}</option>)}</select></label>
        <article><strong>{selected.title}</strong>{eventTime(selected.starts_at) ? <small>{eventTime(selected.starts_at)}</small> : null}<span>{selected.is_linked ? "Linked to this Community" : "Not linked yet"}</span>{selected.summary ? <p>{selected.summary}</p> : null}<small>Linking does not change the event’s Host or register anyone.</small><button type="button" className="button button-outline" disabled={busy || needsRefresh} onClick={() => void updateLink(selected, !selected.is_linked)}>{busy ? "Saving…" : selected.is_linked ? "Unlink event" : "Link event"}</button></article>
      </div> : <div className="community-program-empty"><strong>No available event to link yet.</strong><p>Only published events appear here. You can also create a private gathering just for this Community.</p><button type="button" className="button button-outline" onClick={onCreateGathering}>Create a gathering</button></div>}
    </>}
    {dialog}
  </section>;
}
