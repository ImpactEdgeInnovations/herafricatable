import Link from "next/link";

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
}: {
  action: TableTodaySuggestion;
  community: TableTodaySuggestion;
  person: TableTodaySuggestion;
}) {
  const suggestions = [person, community, action];

  return (
    <section className="table-today" aria-labelledby="table-today-title">
      <header>
        <div>
          <p className="eyebrow">Your Table Today</p>
          <h2 id="table-today-title">Three useful places to begin.</h2>
        </div>
        <p>Chosen from what you have shared. Nothing here is automatic.</p>
      </header>
      <div className="table-today-grid">
        {suggestions.map((suggestion, index) => (
          <article key={suggestion.kicker}>
            <span className="table-today-number" aria-hidden="true">
              0{index + 1}
            </span>
            <div>
              <p>{suggestion.kicker}</p>
              <h3>{suggestion.title}</h3>
              <span>{suggestion.description}</span>
            </div>
            <Link href={suggestion.href}>
              {suggestion.action} <span aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
