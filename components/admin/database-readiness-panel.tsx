export type DatabaseReleaseCheck = {
  area: string;
  label: string;
  migration_file: string;
  missing_items: string[];
  module_key: string;
  ready: boolean;
  sort_order: number;
  summary: string;
};

function missingLabel(value: string) {
  const [kind, name] = value.split(": ");
  return `${kind === "table" ? "Data table" : "Secure action"}: ${name
    .split("_")
    .join(" ")}`;
}

export function DatabaseReadinessPanel({
  checks,
  migrationReady,
}: {
  checks: DatabaseReleaseCheck[];
  migrationReady: boolean;
}) {
  if (!migrationReady || !checks.length) {
    return (
      <section className="database-readiness" id="database-readiness">
        <div className="admin-empty">
          <strong>Database checks couldn’t load</strong>
          <p>
            Reload this workspace to try again. A failed read does not mean a
            database update is missing. No feature settings or member access have changed.
          </p>
        </div>
      </section>
    );
  }

  const readyCount = checks.filter((check) => check.ready).length;
  const grouped = Object.entries(
    checks.reduce<Record<string, DatabaseReleaseCheck[]>>((areas, check) => {
      areas[check.area] = [...(areas[check.area] ?? []), check];
      return areas;
    }, {}),
  );
  const complete = checks.length > 0 && readyCount === checks.length;

  return (
    <section className="database-readiness" id="database-readiness">
      <header>
        <div>
          <p className="eyebrow">Production database</p>
          <h2>Know what is ready before launch.</h2>
          <p>
            This checks for the tables and secure actions each platform area
            needs. It reads structure only—never member data, passwords or
            payment credentials.
          </p>
        </div>
        <aside className={complete ? "ready" : "attention"}>
          <strong>
            {readyCount}/{checks.length}
          </strong>
          <span>{complete ? "Database ready" : "Updates still needed"}</span>
        </aside>
      </header>

      {grouped.map(([area, areaChecks]) => {
        const areaReady = areaChecks.filter((check) => check.ready).length;
        return (
          <section className="database-readiness-group" key={area}>
            <header>
              <h3>{area}</h3>
              <span>
                {areaReady}/{areaChecks.length} ready
              </span>
            </header>
            <div>
              {areaChecks.map((check) => (
                <article
                  className={check.ready ? "ready" : "missing"}
                  key={check.module_key}
                >
                  <header>
                    <span>{check.ready ? "Ready" : "Needs update"}</span>
                    <small>{check.migration_file}</small>
                  </header>
                  <h4>{check.label}</h4>
                  <p>{check.summary}</p>
                  {check.ready ? (
                    <div className="database-readiness-confirmation">
                      Required database structure found.
                    </div>
                  ) : (
                    <details>
                      <summary>
                        See {check.missing_items.length} missing database item
                        {check.missing_items.length === 1 ? "" : "s"}
                      </summary>
                      <ul>
                        {check.missing_items.map((item) => (
                          <li key={item}>{missingLabel(item)}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}
