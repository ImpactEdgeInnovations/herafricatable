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
          <h2 id="table-today-title">Your Table today</h2>
        </div>
        <p>A few suggestions for your next visit.</p>
      </header>
      <div className="table-today-grid">
        {suggestions.map((suggestion) => (
          <article key={suggestion.kicker}>
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
