"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";
import { communityDraftEpoch, communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";

type Album = { id: string; title: string; description: string; contribution_mode: string; is_closed: boolean; photo_count: number; gathering_title: string | null; post_id: string | null };
type Photo = { id: string; caption: string; status: string; uploader_id: string | null; uploader_name: string; created_at: string };
type AlbumList = { albums: Album[]; allowance_bytes: number; used_bytes: number; uploads_enabled: boolean; can_manage: boolean };
type AlbumDetails = { album: Album; photos: Photo[]; can_manage: boolean; can_upload: boolean };
type SelectedFile = { file: File; id?: string; saved?: boolean; error?: string };
const emptyDraft = { title: "", description: "", roomId: "", requestId: "" };
const choices = [ ["hosts_only", "Only Hosts can add photos"], ["members", "Members can add photos immediately"], ["review", "Member photos need approval"] ];
const statusLabels: Record<string, string> = { pending: "Waiting for approval", published: "Visible to members", hidden: "Hidden", rejected: "Not approved", removed: "Removed" };

export function CommunityPhotoAlbums({ communityId, currentUserId }: { communityId: string; currentUserId: string }) {
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
  const input = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const [draft, setDraft, clearDraft] = useCommunityDraft(communityDraftKey(currentUserId, "photo-album", communityId), emptyDraft);
  const unsavedFiles = files.some(item => !item.saved);
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
  const selectedAlbumId = details?.album.id;
  useEffect(() => {
    if (!selectedAlbumId) return;
    let stopped = false;
    async function recheck() {
      const { data, error } = await supabase.rpc("get_community_photo_album", { p_album_id: selectedAlbumId });
      if (stopped) return;
      if (error || !data) { setDetails(null); setList(null); setFiles([]); setMessage("This album could not be opened. Try again when your connection or access is restored."); }
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
    setFiles([]); setBatchId(""); setCaption(""); setPermission(false); setDetails(null); setBusy("album"); setMessage("");
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
  return <details className="community-photo-tools" id="community-photos" onToggle={event => { if (event.currentTarget.open && !opened) { setOpened(true); void load(); } }}>
    <summary><strong>Photos</strong><span>Albums, uploads and photo permissions</span></summary>
    <div className="community-photo-body">
      {dialog}
      {message ? <p role="status" className="network-message">{message}</p> : null}
      {busy === "load" ? <p>Opening albums…</p> : null}
      {!list && !busy ? <button className="button button-outline" onClick={() => void load()}>Try again</button> : null}
      {list ? <>
        <p className="community-photo-allowance">{Math.ceil(list.used_bytes / 1048576)} of {Math.round(list.allowance_bytes / 1048576)} MB used{!list.uploads_enabled ? " · Photo uploads are paused" : ""}</p>
        <div className="community-photo-album-list" role="group" aria-label="Choose an album">
          {list.albums.map(album => <button key={album.id} disabled={Boolean(busy)} aria-pressed={details?.album.id === album.id} onClick={() => void select(album.id)}><strong>{album.title}</strong><small>{album.gathering_title || "Community album"} · {album.photo_count} photos</small></button>)}
          {!list.albums.length ? <p>No albums yet. Start with a name and a short description.</p> : null}
        </div>
        {list.can_manage ? <details className="community-photo-create"><summary>New album</summary><form onSubmit={create}>
          <label>Album name<input required minLength={3} maxLength={140} value={draft.title} disabled={Boolean(busy)} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} /></label>
          <label>Description (optional)<textarea maxLength={2000} rows={3} value={draft.description} disabled={Boolean(busy)} onChange={event => setDraft(previous => ({ ...previous, description: event.target.value }))} /></label>
          <label>Related gathering (optional)<select value={draft.roomId} disabled={Boolean(busy)} onChange={event => setDraft(previous => ({ ...previous, roomId: event.target.value }))}><option value="">Community album — no gathering</option>{gatherings.map(item => <option key={item.room_id} value={item.room_id}>{item.title}</option>)}</select></label>
          <button className="button button-primary" disabled={Boolean(busy) || unsavedFiles}>{busy === "create" ? "Creating…" : "Create album"}</button>
        </form></details> : null}
      </> : null}
      {details ? <section className="community-photo-selected" aria-label={details.album.title}>
        <header><h3>{details.album.title}</h3><p>{details.album.description}</p></header>
        {details.can_manage ? <form onSubmit={settings} className="community-photo-settings">
          <label>Who can add photos?<select value={details.album.contribution_mode} disabled={Boolean(busy)} onChange={event => setDetails(previous => previous ? { ...previous, album: { ...previous.album, contribution_mode: event.target.value } } : previous)}>{choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="community-photo-check"><input type="checkbox" checked={details.album.is_closed} disabled={Boolean(busy)} onChange={event => setDetails(previous => previous ? { ...previous, album: { ...previous.album, is_closed: event.target.checked } } : previous)} />Close this album to new photos</label>
          <button className="button button-outline" disabled={Boolean(busy)}>Save photo settings</button>
        </form> : null}
        {details.can_upload ? <form onSubmit={upload} className="community-photo-upload">
          <label>Add photos<input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={event => {
            const selected = Array.from(event.target.files ?? []);
            if (selected.length > 10 || selected.some(file => file.size > 4 * 1024 * 1024)) { setMessage("Choose up to 10 JPG, PNG or WebP photos, each smaller than 4 MB."); event.target.value = ""; setFiles([]); return; }
            setFiles(selected.map(file => ({ file }))); setBatchId(""); setPermission(false); setMessage("");
          }} /></label>
          <small>Up to 10 photos, each smaller than 4 MB. We resize them and remove location information.</small>
          {files.length ? <ul>{files.map((item, index) => <li key={index}>{item.file.name} — {item.saved ? "Saved" : item.error || "Ready to save"}</li>)}</ul> : null}
          <label>Caption (optional)<input maxLength={500} value={caption} onChange={event => setCaption(event.target.value)} disabled={Boolean(busy)} /></label>
          <label className="community-photo-check"><input type="checkbox" checked={permission} onChange={event => setPermission(event.target.checked)} disabled={Boolean(busy)} />I have permission to share these photos from the people pictured.</label>
          <button className="button button-primary" disabled={Boolean(busy) || !unsavedFiles || !permission}>{busy === "upload" ? "Saving photos…" : files.some(item => item.error) ? "Retry unsaved photos" : "Save photos"}</button>
        </form> : <p>{details.album.is_closed ? "This album is closed to new photos." : !list?.uploads_enabled ? "Photo uploads are paused while final checks are completed." : "Only Community Hosts can add photos here."}</p>}
        <div className="community-photo-grid">{details.photos.map(photo => <article key={photo.id}>
          {["published", "pending", "hidden"].includes(photo.status) ? <img src={`/api/community/photos/${photo.id}`} loading="lazy" alt={photo.caption || `Photo shared by ${photo.uploader_name}`} /> : <div className="community-photo-placeholder">{statusLabels[photo.status]}</div>}
          <p>{photo.caption}</p><small>{photo.uploader_name} · {new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }).format(new Date(photo.created_at))}</small>
          <span>{statusLabels[photo.status]}</span>
          <footer>
            {details.can_manage && photo.status === "pending" ? <><button disabled={Boolean(busy)} onClick={() => void review(photo, "approve")}>Approve</button><button disabled={Boolean(busy)} onClick={() => void review(photo, "reject")}>Decline</button></> : null}
            {details.can_manage && photo.status === "published" ? <button disabled={Boolean(busy)} onClick={() => void review(photo, "hide")}>Hide</button> : null}
            {details.can_manage && ["hidden", "removed"].includes(photo.status) ? <button disabled={Boolean(busy)} onClick={() => void review(photo, "restore")}>Restore</button> : null}
            {photo.status !== "removed" && (details.can_manage || photo.uploader_id === currentUserId) ? <button disabled={Boolean(busy)} onClick={() => void review(photo, "remove")}>Remove</button> : null}
          </footer>
        </article>)}</div>
        {!details.photos.length ? <p>No photos in this album yet.</p> : null}
      </section> : null}
    </div>
  </details>;
}
