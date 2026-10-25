import Link from "next/link";
import { EventPosterImage } from "@/components/events/event-poster-image";

export type TableTodaySuggestion = {
  action: string;
  description: string;
  href: string;
  kicker: string;
  title: string;
};

export function YourTableToday({
  action,
  community,
  person,
  upcoming,
}: {
  action: TableTodaySuggestion;
  community: TableTodaySuggestion;
  person: TableTodaySuggestion;
  upcoming?: { title: string; href: string; when: string; location: string; poster?: string };
}) {
  const suggestions = [action, community, person];

  return (
    <section className="table-today" aria-labelledby="table-today-title">
      <header>
        <div>
          <h2 id="table-today-title">Your Table today</h2>
        </div>
        <p>Pick up where you left off.</p>
      </header>
      <div className={`table-today-layout${upcoming ? " has-upcoming" : ""}`}><div className="table-today-grid">
        {suggestions.map((suggestion, index) => (
          <article key={suggestion.kicker} className={index === 0 ? "table-today-primary" : index === 1 ? "table-today-community" : undefined}>
            <div>
              <p>{suggestion.kicker}</p>
              <h3>{suggestion.title}</h3>
              <span>{suggestion.description}</span>
            </div>
            <Link href={suggestion.href} className={index === 0 ? "button button-primary" : undefined}>
              {suggestion.action} <span aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </div>{upcoming ? <aside className="table-today-upcoming" aria-label="Coming up at the Table">
        <p className="eyebrow">Coming up</p>
        {upcoming.poster ? <EventPosterImage src={upcoming.poster} alt={`Poster for ${upcoming.title}`} /> : <div className="table-upcoming-art" aria-hidden="true"><span>Save the date</span><strong>{upcoming.when.split(",")[0]}</strong></div>}
        <h3>{upcoming.title}</h3><p>{upcoming.when}</p><p>{upcoming.location}</p>
        <Link className="button button-outline" href={upcoming.href}>View event <span aria-hidden="true">→</span></Link>
      </aside> : null}</div>
    </section>
  );
}
