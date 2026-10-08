"use client";

import { Fragment, type ReactNode, useId, useState } from "react";
import { matchesDiscoverySearch } from "@/lib/discovery-search.mjs";

export type EventDiscoveryItem = {
  id: string;
  title: string;
  summary: string | null;
  location: string;
  format: string;
  content: ReactNode;
};

export function EventDiscovery({ items }: { items: EventDiscoveryItem[] }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const suggestions = useId();
  const locations = [...new Set(items.map(item => item.location))].sort((a, b) => a.localeCompare(b));
  const results = items.filter(item => (!location || item.location === location) &&
    matchesDiscoverySearch(query, [item.title, item.summary, item.location, item.format]));
  const filtered = Boolean(query.trim() || location);
  return <>
    <div className="event-discovery-controls">
      <label><span>Find an event</span><input type="search" placeholder="Try an event name or a city" value={query} onChange={event => setQuery(event.target.value)} list={suggestions} /></label>
      <datalist id={suggestions}>{items.map(item => <option key={item.id} value={item.title} />)}</datalist>
      {locations.length > 1 ? <label><span>Location</span><select value={location} onChange={event => setLocation(event.target.value)}><option value="">All locations</option>{locations.map(place => <option key={place} value={place}>{place}</option>)}</select></label> : null}
      {filtered ? <button type="button" onClick={() => { setQuery(""); setLocation(""); }}>Clear filters</button> : null}
      <p className="event-discovery-count" role="status">{filtered ? `${results.length} of ${items.length}` : items.length} {items.length === 1 ? "event" : "events"}</p>
    </div>
    {results.length ? results.map(item => <Fragment key={item.id}>{item.content}</Fragment>) : <div className="event-discovery-empty"><h2>No events match this search</h2><p>Try a shorter name or clear the filters to see all upcoming events.</p><button className="button button-outline" type="button" onClick={() => { setQuery(""); setLocation(""); }}>Show all events</button></div>}
  </>;
}
