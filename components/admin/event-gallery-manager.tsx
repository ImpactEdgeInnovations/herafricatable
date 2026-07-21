"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import type { AdminEvent } from "@/components/admin/event-manager";
import { createClient } from "@/lib/supabase/client";

export type AdminGalleryAlbum = { event_id: string; id: string; introduction: string | null; sort_order: number; status: "draft" | "published" | "archived"; title: string };
export type AdminMediaAsset = { album_id: string; alt_text: string; caption: string | null; captured_at: string | null; credit: string | null; height: number | null; id: string; is_featured: boolean; mime_type: string; signed_url?: string | null; sort_order: number; status: "draft" | "published" | "archived"; storage_path: string; width: number | null };

const blankAlbum = { id: null as string | null, title: "Event moments", introduction: "", status: "draft" as AdminGalleryAlbum["status"], sortOrder: "0" };
const blankAsset = { id: null as string | null, storagePath: "", mimeType: "", width: null as number | null, height: null as number | null, altText: "", caption: "", credit: "", capturedAt: "", status: "draft" as AdminMediaAsset["status"], isFeatured: false, sortOrder: "0" };

function assetForm(asset: AdminMediaAsset) {
  return { id: asset.id, storagePath: asset.storage_path, mimeType: asset.mime_type, width: asset.width, height: asset.height, altText: asset.alt_text, caption: asset.caption ?? "", credit: asset.credit ?? "", capturedAt: asset.captured_at ? asset.captured_at.slice(0, 16) : "", status: asset.status, isFeatured: asset.is_featured, sortOrder: String(asset.sort_order) };
}

export function EventGalleryManager({ events, initialAlbums, initialAssets, migrationReady }: { events: AdminEvent[]; initialAlbums: AdminGalleryAlbum[]; initialAssets: AdminMediaAsset[]; migrationReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const eventAlbums = initialAlbums.filter((album) => album.event_id === eventId);
  const [albumId, setAlbumId] = useState(eventAlbums[0]?.id ?? "");
  const activeAlbum = initialAlbums.find((album) => album.id === albumId);
  const [album, setAlbum] = useState(() => activeAlbum ? { id: activeAlbum.id, title: activeAlbum.title, introduction: activeAlbum.introduction ?? "", status: activeAlbum.status, sortOrder: String(activeAlbum.sort_order) } : blankAlbum);
  const assets = initialAssets.filter((asset) => asset.album_id === albumId);
  const [asset, setAsset] = useState(blankAsset);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function chooseEvent(nextId: string) {
    const nextAlbums = initialAlbums.filter((item) => item.event_id === nextId);
    const nextAlbum = nextAlbums[0];
    setEventId(nextId); setAlbumId(nextAlbum?.id ?? ""); setAsset(blankAsset); setFile(null); setMessage("");
    setAlbum(nextAlbum ? { id: nextAlbum.id, title: nextAlbum.title, introduction: nextAlbum.introduction ?? "", status: nextAlbum.status, sortOrder: String(nextAlbum.sort_order) } : blankAlbum);
  }

  function chooseAlbum(nextId: string) {
    const next = initialAlbums.find((item) => item.id === nextId);
    if (!next) return;
    setAlbumId(nextId); setAlbum({ id: next.id, title: next.title, introduction: next.introduction ?? "", status: next.status, sortOrder: String(next.sort_order) });
    setAsset(blankAsset); setFile(null); setMessage("");
  }

  function showError(error: { message: string } | null) {
    if (!error) return false;
    setBusy(false); setMessage(error.message.includes("schema cache") || error.message.includes("Bucket") ? "Apply 20260722090000_event_gallery_operations.sql in Supabase, then retry." : error.message);
    return true;
  }

  async function saveAlbum(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const { error } = await supabase.rpc("save_gallery_album", { p_album_id: album.id, p_event_id: eventId, p_introduction: album.introduction, p_sort_order: Number(album.sortOrder) || 0, p_status: album.status, p_title: album.title });
    if (showError(error)) return;
    setBusy(false); setMessage("Gallery album saved and audit logged."); window.location.reload();
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    if (!chosen) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(chosen.type)) { setMessage("Choose a JPG, PNG or WebP image."); return; }
    if (chosen.size > 10 * 1024 * 1024) { setMessage("Event images must be 10 MB or smaller."); return; }
    let width: number | null = null; let height: number | null = null;
    try { const bitmap = await createImageBitmap(chosen); width = bitmap.width; height = bitmap.height; bitmap.close(); } catch { /* metadata remains optional */ }
    setFile(chosen); setAsset({ ...blankAsset, mimeType: chosen.type, width, height, altText: chosen.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") }); setMessage("");
  }

  async function saveAsset(event: FormEvent) {
    event.preventDefault();
    if (!albumId) { setMessage("Save an album before adding media."); return; }
    if (!asset.id && !file) { setMessage("Choose an image to upload."); return; }
    setBusy(true); setMessage("");
    let path = asset.storagePath;
    if (!asset.id && file) {
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      path = `${eventId}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from("event-media").upload(path, file, { cacheControl: "31536000", contentType: file.type, upsert: false });
      if (showError(upload.error)) return;
    }
    const { error } = await supabase.rpc("save_media_asset", { p_album_id: albumId, p_alt_text: asset.altText, p_asset_id: asset.id, p_caption: asset.caption, p_captured_at: asset.capturedAt ? new Date(asset.capturedAt).toISOString() : null, p_credit: asset.credit, p_height: asset.height, p_is_featured: asset.isFeatured, p_mime_type: asset.mimeType, p_sort_order: Number(asset.sortOrder) || 0, p_status: asset.status, p_storage_path: path, p_width: asset.width });
    if (error) {
      if (!asset.id && path) await supabase.storage.from("event-media").remove([path]);
      if (showError(error)) return;
    }
    setBusy(false); setMessage("Media saved securely and audit logged."); window.location.reload();
  }

  if (!migrationReady) return <section className="admin-section" id="gallery"><div className="admin-empty"><strong>Gallery database update required</strong><p>Apply <code>20260722090000_event_gallery_operations.sql</code> to enable private media operations.</p></div></section>;
  if (!events.length) return null;

  return <section className="admin-section event-gallery-manager" id="gallery" aria-labelledby="gallery-title">
    <div className="admin-section-heading"><div><p className="eyebrow">Secure media</p><h2 id="gallery-title">Event gallery</h2><p>Draft images remain private. Publishing issues short-lived delivery URLs without making the Storage bucket public.</p></div><label className="event-content-select">Working event<select value={eventId} onChange={(event) => chooseEvent(event.target.value)}>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
    <div className="gallery-admin-toolbar"><label>Album<select value={albumId} onChange={(event) => chooseAlbum(event.target.value)}><option value="">New album</option>{eventAlbums.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="button" onClick={() => { setAlbumId(""); setAlbum(blankAlbum); setAsset(blankAsset); }}>New album</button></div>
    <div className="gallery-admin-grid"><form className="gallery-album-form" onSubmit={saveAlbum}><p className="eyebrow">Album settings</p><div className="form-grid"><label className="form-wide">Album title<input value={album.title} onChange={(e) => setAlbum({ ...album, title: e.target.value })} required /></label><label className="form-wide">Introduction<textarea rows={4} value={album.introduction} onChange={(e) => setAlbum({ ...album, introduction: e.target.value })} /></label><label>Status<select value={album.status} onChange={(e) => setAlbum({ ...album, status: e.target.value as AdminGalleryAlbum["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label>Order<input type="number" min="0" value={album.sortOrder} onChange={(e) => setAlbum({ ...album, sortOrder: e.target.value })} /></label></div><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save album"}</button></form>
      <div className="gallery-assets-panel"><div className="gallery-assets-list"><label className="gallery-upload-control"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseFile(event)} /><span>Upload image</span><small>JPG, PNG or WebP · 10 MB maximum</small></label>{assets.map((item) => <button type="button" key={item.id} className={asset.id === item.id ? "selected" : ""} onClick={() => { setAsset(assetForm(item)); setFile(null); }}><span className="gallery-thumb">{item.signed_url ? <img src={item.signed_url} alt="" /> : null}</span><span><strong>{item.caption || item.alt_text}</strong><small>{item.status}{item.is_featured ? " · featured" : ""}</small></span></button>)}</div>
        <form className="gallery-asset-form" onSubmit={saveAsset}>{file ? <p className="selected-file">Selected: {file.name}</p> : null}{asset.id || file ? <div className="form-grid"><label className="form-wide">Accessible image description<input value={asset.altText} onChange={(e) => setAsset({ ...asset, altText: e.target.value })} required /></label><label className="form-wide">Caption<textarea rows={3} value={asset.caption} onChange={(e) => setAsset({ ...asset, caption: e.target.value })} /></label><label>Photographer or source credit<input value={asset.credit} onChange={(e) => setAsset({ ...asset, credit: e.target.value })} /></label><label>Captured at<input type="datetime-local" value={asset.capturedAt} onChange={(e) => setAsset({ ...asset, capturedAt: e.target.value })} /></label><label>Status<select value={asset.status} onChange={(e) => setAsset({ ...asset, status: e.target.value as AdminMediaAsset["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label>Order<input type="number" min="0" value={asset.sortOrder} onChange={(e) => setAsset({ ...asset, sortOrder: e.target.value })} /></label><label className="publish-control"><input type="checkbox" checked={asset.isFeatured} onChange={(e) => setAsset({ ...asset, isFeatured: e.target.checked })} /> Featured image</label></div> : <div className="admin-empty"><strong>Select or upload an image</strong><p>Metadata and publication controls will appear here.</p></div>}{asset.id || file ? <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save media"}</button> : null}</form>
      </div></div>
    {message ? <p className="manager-message content-manager-message" role="status">{message}</p> : null}
  </section>;
}
