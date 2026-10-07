"use client";

import { useEffect, useId, useRef, useState } from "react";

export type ViewablePhoto = { id: string; caption: string; uploader_name: string; created_at: string };

export function CommunityPhotoViewer({ photos, selectedId, onSelect, onClose }: {
  photos: ViewablePhoto[]; selectedId: string; onSelect(id: string): void; onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const titleId = useId();
  const [failed, setFailed] = useState(false);
  const index = photos.findIndex(photo => photo.id === selectedId);
  const photo = photos[index];
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);
  useEffect(() => { setFailed(false); if (!photo) onClose(); }, [selectedId, Boolean(photo), onClose]);
  function move(direction: number) {
    const next = photos[index + direction];
    if (next) onSelect(next.id);
  }
  return <dialog ref={dialog} className="community-photo-viewer" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    }}>
    <header><h2 id={titleId}>Community photo</h2><button type="button" onClick={onClose} autoFocus>Close</button></header>
    {photo ? <>
      <div className="community-photo-viewer-image" onTouchStart={event => {
        if (event.touches.length === 1) start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        else start.current = null;
      }} onTouchEnd={event => {
        const point = event.changedTouches[0];
        if (start.current && point) {
          const dx = point.clientX - start.current.x, dy = point.clientY - start.current.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
        }
        start.current = null;
      }}>
        {failed ? <p role="status">This photo could not be opened. It may have been removed or your access may have changed.</p> :
          <img key={photo.id} src={`/api/community/photos/${photo.id}?size=original`} alt={photo.caption || `Photo shared by ${photo.uploader_name}`} onError={() => setFailed(true)} />}
      </div>
      <p>{photo.caption}</p>
      <small>Shared by {photo.uploader_name} · {new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }).format(new Date(photo.created_at))}</small>
      <footer aria-label="Browse album photos"><button type="button" disabled={index === 0} onClick={() => move(-1)}>← Previous</button>
        <span role="status" aria-live="polite">{index + 1} of {photos.length}</span>
        <button type="button" disabled={index === photos.length - 1} onClick={() => move(1)}>Next →</button></footer>
    </> : <p role="status">This photo is no longer available.</p>}
  </dialog>;
}
