"use client";

import { useEffect, useId, useRef, useState } from "react";
import { eventImageFit, type EventImageStyle } from "@/lib/events/image-fit";

export function EventCardMedia({ src, alt, title, dateLabel, imageStyle = "automatic" }: {
  src?: string | null;
  alt?: string | null;
  title: string;
  dateLabel: string;
  imageStyle?: EventImageStyle;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const frame = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ src: "", width: 0, height: 0 });
  const available = Boolean(src && failedSource !== src);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => { const rect = element.getBoundingClientRect(); setSize({ width: rect.width, height: rect.height }); };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [src, available]);
  const fit = eventImageFit(imageStyle, natural.src === src ? natural.width : 0, natural.src === src ? natural.height : 0, size.width, size.height);

  if (!available) return (
    <div className="public-event-card-media public-event-card-placeholder" aria-hidden="true">
      <span>Her Africa Table</span>
      <strong>{title}</strong>
      <small>{dateLabel}</small>
    </div>
  );

  return <>
    <button className="public-event-card-media public-event-poster-button" type="button" ref={frame} data-image-fit={fit}
      aria-label={`View full poster for ${title}`} onClick={() => dialog.current?.showModal()}>
      <img className="public-event-poster" alt="" src={src!} loading="lazy" style={{ objectFit: fit }}
        onLoad={(event) => setNatural({ src: src!, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        onError={() => setFailedSource(src!)} />
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
