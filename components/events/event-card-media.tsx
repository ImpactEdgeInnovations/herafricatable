"use client";

import { useId, useRef, useState } from "react";

export function EventCardMedia({ src, alt, title, dateLabel }: {
  src?: string | null;
  alt?: string | null;
  title: string;
  dateLabel: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const available = Boolean(src && failedSource !== src);

  if (!available) return (
    <div className="public-event-card-media public-event-card-placeholder" aria-hidden="true">
      <span>Her Africa Table</span>
      <strong>{title}</strong>
      <small>{dateLabel}</small>
    </div>
  );

  return <>
    <button className="public-event-card-media public-event-poster-button" type="button"
      aria-label={`View full poster for ${title}`} onClick={() => dialog.current?.showModal()}>
      <img className="public-event-poster" alt="" src={src!} loading="lazy" onError={() => setFailedSource(src!)} />
      <span className="public-event-poster-hint">View full poster <span aria-hidden="true">↗</span></span>
    </button>
    <dialog className="event-poster-dialog" aria-labelledby={heading} ref={dialog}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <header>
        <div><span>Event poster</span><h2 id={heading}>{title}</h2></div>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close poster">Close <span aria-hidden="true">×</span></button>
      </header>
      <div className="event-poster-dialog-image"><img src={src!} alt={alt?.trim() || `Poster for ${title}`} /></div>
    </dialog>
  </>;
}
