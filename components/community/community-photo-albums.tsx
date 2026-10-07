"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";
import { communityDraftEpoch, communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";
import { CommunityPhotoViewer } from "./community-photo-viewer";
import { CommunityGatheringDiscussion } from "@/components/member/community-gathering-discussion";

type Album = { id: string; title: string; description: string; contribution_mode: string; is_closed: boolean; photo_count: number; gathering_title: string | null; post_id: string | null };
type Photo = { id: string; caption: string; status: string; uploader_id: string | null; uploader_name: string; created_at: string };
type AlbumList = { albums: Album[]; allowance_bytes: number; used_bytes: number; uploads_enabled: boolean; can_manage: boolean; pilot_available?: boolean; admin_paused?: boolean };
type AlbumDetails = { album: Album; photos: Photo[]; can_manage: boolean; can_upload: boolean };
type SelectedFile = { file: File; id?: string; saved?: boolean; error?: string };
const emptyDraft = { title: "", description: "", roomId: "", requestId: "" };
const choices = [ ["hosts_only", "Only Hosts can add photos"], ["members", "Members can add photos immediately"], ["review", "Member photos need approval"] ];
const statusLabels: Record<string, string> = { pending: "Waiting for approval", published: "Visible to members", hidden: "Hidden", rejected: "Not approved", removed: "Removed" };

export function CommunityPhotoAlbums({ communityId, currentUserId, presentation = "host", onUnsavedChange, onBusyChange }: {
  communityId: string; currentUserId: string; presentation?: "host" | "member";
  onUnsavedChange?(unsaved: boolean): void; onBusyChange?(busy: boolean): void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { ask, dialog } = useActionDialog();
  const [list, setList] = useState<AlbumList | null>(null);
  const [details, setDetails] = useState<AlbumDetails | null>(null);
  const [gatherings, setGatherings] = useState<{ room_id: string; title: string }[]>([]);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [batchId, setBatchId] = useState("");
  const [caption, setCaption] = useState("");
  const [permission, setPermission] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState("");
  const [showDiscussion, setShowDiscussion] = useState(false);
  const closePhoto = useCallback(() => setSelectedPhoto(""), []);
  const input = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const [draft, setDraft, clearDraft] = useCommunityDraft(communityDraftKey(currentUserId, "photo-album", communityId), emptyDraft);
  const unsavedFiles = files.some(item => !item.saved);
  useEffect(() => { onUnsavedChange?.(unsavedFiles); }, [unsavedFiles, onUnsavedChange]);
  useEffect(() => { onBusyChange?.(Boolean(busy)); }, [busy, onBusyChange]);
  useEffect(() => {
    if (presentation === "member") { setOpened(true); void load(); }
  }, [communityId, presentation]);
  useEffect(() => {
    if (!unsavedFiles) return;
    const epoch = communityDraftEpoch();
    function warn(event: BeforeUnloadEvent) { if (epoch !== communityDraftEpoch()) return; event.preventDefault(); event.returnValue = ""; }
    async function navigation(event: MouseEvent) {
      const anchor = (event.target as Element)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      event.preventDefault(); event.stopPropagation();
      if (await ask({ title: "Leave without saving these photos?", description: "Your album text stays in this tab, but you will need to choose the unsaved photo files again.", confirmLabel: "Leave page", tone: "danger" })) {
        setFiles([]);
        const url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) router.push(url.pathname + url.search + url.hash);
        else window.location.assign(url.href);
      }
    }
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigation, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigation, true); };
  }, [unsavedFiles, ask, router]);
  useEffect(() => () => { requestVersion.current++; }, []);
  useEffect(() => {
    if (!opened) return;
    let stopped = false;
    async function recheckList() {
      const { data, error } = await supabase.rpc("list_community_photo_albums", { p_community_id: communityId });
      if (stopped) return;
      if (error || !data) {
        setList(null); setDetails(null); setSelectedPhoto(""); setFiles([]);
        setMessage("Photos could not be opened. Please try again when your connection or membership access is restored.");
      } else setList(data as AlbumList);
    }
    const timer = window.setInterval(() => void recheckList(), 30000);
    window.addEventListener("focus", recheckList);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("focus", recheckList); };
  }, [opened, communityId, supabase]);
  const selectedAlbumId = details?.album.id;
  useEffect(() => {
    if (!selectedAlbumId) return;
    let stopped = false;
    async function recheck() {
      const { data, error } = await supabase.rpc("get_community_photo_album", { p_album_id: selectedAlbumId });
      if (stopped) return;
      if (error || !data) { setDetails(null); setList(null); setFiles([]); setSelectedPhoto(""); setMessage("This album could not be opened. Try again when your connection or access is restored."); }
      else setDetails(previous => previous && previous.album.id === selectedAlbumId ? { ...previous, photos: (data as AlbumDetails).photos, can_upload: (data as AlbumDetails).can_upload } : previous);
    }
    const timer = window.setInterval(() => void recheck(), 30000);
    window.addEventListener("focus", recheck);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("focus", recheck); };
  }, [selectedAlbumId, supabase]);

  async function refresh() {
    const { data, error } = await supabase.rpc("list_community_photo_albums", { p_community_id: communityId });
    if (error) throw error;
    setList(data as AlbumList);
  }
  async function load() {
    setBusy("load"); setMessage("");
    try {
      await refresh();
      const { data } = await supabase.rpc("list_community_gathering_cards", { p_community_id: communityId });
      setGatherings((data ?? []) as { room_id: string; title: string }[]);
    } catch (error) { setList(null); setMessage(memberErrorMessage(error, "open Community photos")); }
    finally { setBusy(""); }
  }
  async function select(id: string) {
    if (unsavedFiles && !(await ask({ title: "Choose a different album?", description: "The photos you have not saved will need to be selected again.", confirmLabel: "Change album", tone: "danger" }))) return;
    const version = ++requestVersion.current;
    setFiles([]); setBatchId(""); setCaption(""); setPermission(false); setSelectedPhoto(""); setShowDiscussion(false); setDetails(null); setBusy("album"); setMessage("");
    const { data, error } = await supabase.rpc("get_community_photo_album", { p_album_id: id });
    if (version !== requestVersion.current) return;
    if (error) setMessage(memberErrorMessage(error, "open this album")); else setDetails(data as AlbumDetails);
    setBusy("");
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unsavedFiles) { setMessage("Save your selected photos before creating another album."); return; }
    setBusy("create"); setMessage("");
    const requestId = draft.requestId || crypto.randomUUID();
    setDraft(previous => ({ ...previous, requestId }));
    try {
      const { data, error } = await supabase.rpc("create_community_photo_album", { p_community_id: communityId, p_request_id: requestId,
        p_title: draft.title, p_description: draft.description, p_room_id: draft.roomId || null });
      if (error) throw error;
      await refresh();
      const { data: album, error: albumError } = await supabase.rpc("get_community_photo_album", { p_album_id: data });
      if (albumError) throw albumError;
      setDetails(album as AlbumDetails); clearDraft(emptyDraft); setMessage("Album created.");
    } catch (error) { setMessage(memberErrorMessage(error, "create this album")); }
    finally { setBusy(""); }
  }
  async function settings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!details) return; setBusy("settings"); setMessage("");
    const { error } = await supabase.rpc("save_community_photo_album_settings", { p_album_id: details.album.id, p_contribution_mode: details.album.contribution_mode, p_is_closed: details.album.is_closed });
    setMessage(error ? memberErrorMessage(error, "save photo settings") : "Photo settings saved."); setBusy("");
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!details || !files.length || !permission) return;
    setBusy("upload"); setMessage("");
    let selected = [...files];
    try {
      if (!selected.every(item => item.id)) {
        const requestId = batchId || crypto.randomUUID(); setBatchId(requestId);
        const { data, error } = await supabase.rpc("reserve_community_album_photos", { p_album_id: details.album.id, p_request_id: requestId, p_count: selected.length, p_permission_confirmed: permission });
        if (error) throw error;
        if (!Array.isArray(data) || data.length !== selected.length) throw new Error("This upload has expired. Choose your photos again.");
        selected = selected.map((item, index) => ({ ...item, id: data[index].id as string })); setFiles(selected);
      }
      for (let index = 0; index < selected.length; index++) {
        if (selected[index].saved) continue;
        setMessage(`Saving photo ${index + 1} of ${selected.length}…`);
        try {
          const response = await fetch(`/api/community/photos/${selected[index].id}/upload`, { method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/octet-stream", "X-Photo-Caption": encodeURIComponent(caption) }, body: selected[index].file });
          const result = await response.json();
          if (!response.ok || !["published", "pending"].includes(result.status)) throw new Error(result.error || "This photo could not be saved.");
          selected[index] = { ...selected[index], saved: true, error: undefined };
        } catch (error) { selected[index] = { ...selected[index], error: memberErrorMessage(error, "save this photo") }; }
        setFiles([...selected]);
      }
      const saved = selected.filter(item => item.saved).length;
      setMessage(saved === selected.length ? "Photos saved." : `${saved} of ${selected.length} photos saved. You can retry the remaining photos.`);
      if (saved === selected.length) { setFiles([]); setBatchId(""); setPermission(false); setCaption(""); if (input.current) input.current.value = ""; }
      const { data } = await supabase.rpc("get_community_photo_album", { p_album_id: details.album.id });
      if (data) setDetails(data as AlbumDetails);
      await refresh();
    } catch (error) { setMessage(memberErrorMessage(error, "save these photos")); }
    finally { setBusy(""); }
  }
  async function review(photo: Photo, action: string) {
    if (!details) return;
    if (["remove", "reject"].includes(action) && !(await ask({ title: action === "remove" ? "Remove this photo?" : "Decline this photo?", description: "It will not be visible to Community members. Removed files are cleared after seven days.", confirmLabel: action === "remove" ? "Remove photo" : "Decline photo", tone: "danger" }))) return;
    setBusy(photo.id); setMessage("");
    try {
      const { error } = await supabase.rpc("review_community_album_photo", { p_photo_id: photo.id, p_action: action });
      if (error) throw error;
      const { data, error: albumError } = await supabase.rpc("get_community_photo_album", { p_album_id: details.album.id });
      if (albumError) throw albumError;
      if (data) setDetails(data as AlbumDetails);
      await refresh();
      setMessage("Photo updated.");
    } catch (error) { setMessage(memberErrorMessage(error, "update this photo")); }
    finally { setBusy(""); }
  }
  async function report(photo: Photo) {
    const answer = await ask({ title: "Report this photo privately", description: "Tell the Her Africa Table safety team what worries you. Your report is not shown in the Community.", confirmLabel: "Send report", fields: [
      { name: "category", label: "Reason", type: "select", initialValue: "privacy", options: [{ value: "privacy", label: "Shared without permission" }, { value: "harassment", label: "Harassment" }, { value: "safety", label: "Safety" }, { value: "spam", label: "Spam" }, { value: "other", label: "Other" }] },
      { name: "details", label: "What happened?", type: "textarea", required: true, minLength: 10, maxLength: 2000 },
    ] });
    if (!answer) return;
    setBusy(photo.id); setMessage("");
    try {
      const { error } = await supabase.rpc("report_community_photo", { p_photo_id: photo.id, p_category: String(answer.category), p_details: String(answer.details) });
      if (error) throw error;
      setMessage("Your report was sent privately to the safety team.");
    } catch (error) { setMessage(memberErrorMessage(error, "send your report")); }
    finally { setBusy(""); }
  }
  async function togglePilotPhotos() {
    if (!list || busy) return;
    setBusy("photo-sharing"); setMessage("");
    try {
      const { error } = await supabase.rpc("save_pilot_community_photo_uploads", { p_community_id: communityId, p_enabled: !list.uploads_enabled });
      if (error) throw error;
      const enabled = !list.uploads_enabled;
      await load();
      if (details) await select(details.album.id);
      setMessage(enabled ? "Photo sharing is on. Each album decides who can add photos." : "Photo sharing is paused. Existing photos are still visible.");
    } catch (error) { setMessage(memberErrorMessage(error, "change photo sharing")); }
    finally { setBusy(""); }
  }
  const content = <div className="community-photo-body">
      {dialog}
      {selectedPhoto && details ? <CommunityPhotoViewer photos={details.photos.filter(photo => ["published", "pending", "hidden"].includes(photo.status))} selectedId={selectedPhoto} onSelect={setSelectedPhoto} onClose={closePhoto} /> : null}
      {message ? <p role="status" className="network-message">{message}</p> : null}
      {busy === "load" ? <p>Opening albums…</p> : null}
      {!list && !busy ? <button className="button button-outline" onClick={() => void load()}>Try again</button> : null}
      {list ? <>
        {list.can_manage ? <p className="community-photo-allowance">{Math.ceil(list.used_bytes / 1048576)} of {Math.round(list.allowance_bytes / 1048576)} MB used{!list.uploads_enabled ? " · Photo uploads are paused" : ""}</p> : null}
        {list.can_manage && list.pilot_available ? <div>
          {list.admin_paused ? <p>Admin has paused photo sharing. Ask Admin to reopen it.</p> : <button className="button button-outline" disabled={Boolean(busy) || unsavedFiles} onClick={() => void togglePilotPhotos()}>{list.uploads_enabled ? "Pause photo sharing" : "Allow photos during the pilot"}</button>}
        </div> : null}
        {list.albums.length && !details ? <p>Choose an album to view photos or add yours where the Host allows it.</p> : null}
        <div className="community-photo-album-list" role="group" aria-label="Choose an album">
          {list.albums.map(album => <button key={album.id} disabled={Boolean(busy)} aria-pressed={details?.album.id === album.id} onClick={() => void select(album.id)}><strong>{album.title}</strong><small>{album.gathering_title || "Community album"} · {album.photo_count} photos</small></button>)}
          {!list.albums.length ? <p>{list.can_manage ? "No albums yet. Start with a name and a short description." : "No photos yet. Albums shared by your Community will appear here."}</p> : null}
        </div>
        {list.can_manage ? <details className="community-photo-create"><summary>New album</summary><form onSubmit={create}>
          <label>Album name<input required minLength={3} maxLength={140} value={draft.title} disabled={Boolean(busy)} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} /></label>
          <label>Description (optional)<textarea maxLength={2000} rows={3} value={draft.description} disabled={Boolean(busy)} onChange={event => setDraft(previous => ({ ...previous, description: event.target.value }))} /></label>
          <label>Related gathering (optional)<select value={draft.roomId} disabled={Boolean(busy)} onChange={event => setDraft(previous => ({ ...previous, roomId: event.target.value }))}><option value="">Community album — no gathering</option>{gatherings.map(item => <option key={item.room_id} value={item.room_id}>{item.title}</option>)}</select></label>
          <button className="button button-primary" disabled={Boolean(busy) || unsavedFiles}>{busy === "create" ? "Creating…" : "Create album"}</button>
        </form></details> : null}
      </> : null}
      {details ? <section className="community-photo-selected" aria-label={details.album.title}>
        <header><h3>{details.album.title}</h3>{details.album.gathering_title ? <small>From {details.album.gathering_title}</small> : null}<p>{details.album.description}</p></header>
        <button type="button" className="button button-outline" aria-expanded={showDiscussion} onClick={() => setShowDiscussion(value => !value)}>{showDiscussion ? "Close conversation" : "Open conversation"}</button>
        {showDiscussion ? <CommunityGatheringDiscussion key={details.album.id} albumId={details.album.id} currentUserId={currentUserId} revision={0} /> : null}
        {details.can_manage ? <form onSubmit={settings} className="community-photo-settings">
          <label>Who can add photos?<select value={details.album.contribution_mode} disabled={Boolean(busy)} onChange={event => setDetails(previous => previous ? { ...previous, album: { ...previous.album, contribution_mode: event.target.value } } : previous)}>{choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="community-photo-check"><input type="checkbox" checked={details.album.is_closed} disabled={Boolean(busy)} onChange={event => setDetails(previous => previous ? { ...previous, album: { ...previous.album, is_closed: event.target.checked } } : previous)} />Close this album to new photos</label>
          <button className="button button-outline" disabled={Boolean(busy)}>Save photo settings</button>
        </form> : null}
        {details.can_upload ? <form onSubmit={upload} className="community-photo-upload">
          <p>Your photos will be saved in <strong>{details.album.title}</strong>{details.album.contribution_mode === "review" && !details.can_manage ? " after the Host approves them" : ""}.</p>
          <label>Add photos to this album<input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={event => {
            const selected = Array.from(event.target.files ?? []);
            if (selected.length > 10 || selected.some(file => file.size > 4 * 1024 * 1024)) { setMessage("Choose up to 10 JPG, PNG or WebP photos, each smaller than 4 MB."); event.target.value = ""; setFiles([]); return; }
            setFiles(selected.map(file => ({ file }))); setBatchId(""); setPermission(false); setMessage("");
          }} /></label>
          <small>Up to 10 photos, each smaller than 4 MB. We resize them and remove location information.</small>
          {files.length ? <ul>{files.map((item, index) => <li key={index}>{item.file.name} — {item.saved ? "Saved" : item.error || "Ready to save"}</li>)}</ul> : null}
          <label>Caption (optional)<input maxLength={500} value={caption} onChange={event => setCaption(event.target.value)} disabled={Boolean(busy)} /></label>
          <label className="community-photo-check"><input type="checkbox" checked={permission} onChange={event => setPermission(event.target.checked)} disabled={Boolean(busy)} />I have permission to share these photos from the people pictured.</label>
          <button className="button button-primary" disabled={Boolean(busy) || !unsavedFiles || !permission}>{busy === "upload" ? "Saving photos…" : files.some(item => item.error) ? "Retry unsaved photos" : "Save photos"}</button>
        </form> : <p>{details.album.is_closed ? "This album is closed to new photos." : !list?.uploads_enabled ? "Photo sharing is paused in this Community. Your Host can tell you when it reopens." : details.album.contribution_mode === "hosts_only" && !details.can_manage ? "Only Community Hosts can add photos here." : "This album is not accepting new photos right now."}</p>}
        <div className="community-photo-grid">{details.photos.map(photo => <article key={photo.id}>
          {["published", "pending", "hidden"].includes(photo.status) ? <button type="button" className="community-photo-open" aria-label={photo.caption ? `Open photo: ${photo.caption}` : `Open photo shared by ${photo.uploader_name}`} onClick={() => setSelectedPhoto(photo.id)}><img src={`/api/community/photos/${photo.id}`} loading="lazy" alt={photo.caption || `Photo shared by ${photo.uploader_name}`} /></button> : <div className="community-photo-placeholder">{statusLabels[photo.status]}</div>}
          <p>{photo.caption}</p><small>{photo.uploader_name} · {new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }).format(new Date(photo.created_at))}</small>
          <span>{statusLabels[photo.status]}</span>
          <footer>
            {["published", "pending", "hidden"].includes(photo.status) ? <button disabled={Boolean(busy)} onClick={() => void report(photo)}>Report privately</button> : null}
            {details.can_manage && photo.status === "pending" ? <><button disabled={Boolean(busy)} onClick={() => void review(photo, "approve")}>Approve</button><button disabled={Boolean(busy)} onClick={() => void review(photo, "reject")}>Decline</button></> : null}
            {details.can_manage && photo.status === "published" ? <button disabled={Boolean(busy)} onClick={() => void review(photo, "hide")}>Hide</button> : null}
            {details.can_manage && ["hidden", "removed"].includes(photo.status) ? <button disabled={Boolean(busy)} onClick={() => void review(photo, "restore")}>Restore</button> : null}
            {photo.status !== "removed" && (details.can_manage || photo.uploader_id === currentUserId) ? <button disabled={Boolean(busy)} onClick={() => void review(photo, "remove")}>Remove</button> : null}
          </footer>
        </article>)}</div>
        {!details.photos.length ? <p>No photos in this album yet.</p> : null}
      </section> : null}
    </div>;
  return presentation === "member" ? <section className="community-photo-tools community-photo-member" id="community-photos" aria-label="Community photos">{content}</section> :
    <details className="community-photo-tools" id="community-photos" onToggle={event => { if (event.currentTarget.open && !opened) { setOpened(true); void load(); } }}>
      <summary><strong>Photos</strong><span>Albums, uploads and photo permissions</span></summary>{content}
    </details>;
}
