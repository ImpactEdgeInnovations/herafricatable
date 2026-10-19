"use client";

import { useEventPoster } from "@/components/events/use-event-poster";

export function EventPosterImage({ src, alt }: { src: string; alt: string }) {
  const image = useEventPoster(src);
  return <figure className="event-detail-poster">
    {image.failed ? <div className="event-poster-unavailable" role="status"><p>Image unavailable</p><button type="button" onClick={image.retry}>Retry image</button></div>
      : <img alt={alt} src={image.url} fetchPriority="high" onLoad={image.onLoad} onError={image.onError} />}
  </figure>;
}
