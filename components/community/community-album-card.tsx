"use client";

import { useState } from "react";

export type CommunityAlbumSummary = {
  id: string; title: string; gathering_title: string | null; photo_count: number; cover_photo_id?: string | null;
};

export function CommunityAlbumCard({ album, selected, disabled, onOpen }: {
  album: CommunityAlbumSummary; selected: boolean; disabled: boolean; onOpen(): void;
}) {
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const showCover = album.cover_photo_id && failedCover !== album.cover_photo_id;
  return <button type="button" className="community-album-card" aria-pressed={selected} disabled={disabled} onClick={onOpen}>
    <span className="community-album-card-image" aria-hidden="true">
      {showCover ? <img src={`/api/community/photos/${album.cover_photo_id}`} alt="" loading="lazy" onError={() => setFailedCover(album.cover_photo_id!)} /> : <span>Photo album</span>}
    </span>
    <span className="community-album-card-copy"><strong>{album.title}</strong><small>{album.gathering_title || "Community album"}</small><span>{album.photo_count} {album.photo_count === 1 ? "photo" : "photos"}</span></span>
  </button>;
}
