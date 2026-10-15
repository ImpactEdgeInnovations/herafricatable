"use client";

import { Fragment, type ReactNode, useId, useState } from "react";
import { matchesDiscoverySearch } from "@/lib/discovery-search.mjs";

export type EventDiscoveryItem = {
  id: string;
  title: string;
  summary: string | null;
  location: string;
  format: string;
  startsAt?: string;
  timezone?: string;
  content: ReactNode;
};

export function EventDiscovery({ items }: { items: EventDiscoveryItem[] }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [format, setFormat] = useState("");
  const [month, setMonth] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const suggestions = useId();
  const locations = [...new Set(items.map(item => item.location))].sort((a, b) => a.localeCompare(b));
  function monthOf(item: EventDiscoveryItem) {
    if (!item.startsAt) return "";
    const parts=new Intl.DateTimeFormat('en',{year:'numeric',month:'2-digit',timeZone:item.timezone || 'Africa/Nairobi'}).formatToParts(new Date(item.startsAt));
    return `${parts.find(part=>part.type==='year')?.value}-${parts.find(part=>part.type==='month')?.value}`;
  }
  const months=[...new Set(items.map(monthOf).filter(Boolean))].sort();
  const formatOf=(item:EventDiscoveryItem)=>item.format.includes('hybrid') ? 'hybrid' : item.format.startsWith('online') || item.format.startsWith('virtual') ? 'online' : 'in_person';
  const results = items.filter(item => (!location || item.location === location) &&
    (!format || formatOf(item) === format) && (!month || monthOf(item) === month) &&
    matchesDiscoverySearch(query, [item.title, item.summary, item.location, item.format]));
  const filtered = Boolean(query.trim() || location || format || month);
  const reset=()=>{setQuery("");setLocation("");setFormat("");setMonth("");setVisibleCount(12);};
  return <>
    <div className="event-discovery-controls">
      <label><span>Find an event</span><input type="search" placeholder="Event name, topic or city" value={query} onChange={event => {setQuery(event.target.value);setVisibleCount(12);}} list={suggestions} /></label>
      <datalist id={suggestions}>{items.map(item => <option key={item.id} value={item.title} />)}</datalist>
      <label><span>Location</span><select value={location} onChange={event => {setLocation(event.target.value);setVisibleCount(12);}}><option value="">All locations</option>{locations.map(place => <option key={place} value={place}>{place}</option>)}</select></label>
      <label><span>How you’ll meet</span><select value={format} onChange={event=>{setFormat(event.target.value);setVisibleCount(12);}}><option value="">All events</option><option value="in_person">In person</option><option value="online">Online</option><option value="hybrid">In person & online</option></select></label>
      <label><span>When</span><select value={month} onChange={event=>{setMonth(event.target.value);setVisibleCount(12);}}><option value="">Any month</option>{months.map(value=><option key={value} value={value}>{new Intl.DateTimeFormat('en-KE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}-01T00:00:00Z`))}</option>)}</select></label>
      {filtered ? <button type="button" onClick={reset}>Clear filters</button> : null}
      <p className="event-discovery-count" role="status">{filtered ? `${results.length} of ${items.length}` : items.length} {items.length === 1 ? "event" : "events"}</p>
    </div>
    {results.length ? <><div className="event-discovery-grid">{results.slice(0,visibleCount).map(item => <Fragment key={item.id}>{item.content}</Fragment>)}</div>{results.length>visibleCount ? <div className="event-discovery-more"><p>Showing {visibleCount} of {results.length} events</p><button className="button button-outline" type="button" onClick={()=>setVisibleCount(count=>count+12)}>Show more events</button></div> : null}</> : <div className="event-discovery-empty"><h2>No events match this search</h2><p>Try a shorter name or clear the filters to see all upcoming events.</p><button className="button button-outline" type="button" onClick={reset}>Show all events</button></div>}
  </>;
}
