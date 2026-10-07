"use client";

import { useState } from "react";

export function CommunityAvatar({ name, src }: { name: string; src: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src
    ? <img className="community-person-avatar" alt="" src={src} loading="lazy" onError={() => setFailedSrc(src)} />
    : <span className="community-person-avatar is-placeholder" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase()}</span>;
}
