import type { ReadinessMetric } from "@/components/admin/analytics-readiness";
import type { DatabaseReleaseCheck } from "@/components/admin/database-readiness-panel";
import type { LaunchGateCheck, EnvironmentSignal } from "@/components/admin/launch-gate-control";
import type { ModuleReleaseCheck } from "@/components/admin/module-release-gate";

type ReadinessItem = {
  label: string;
  detail: string;
  ready: boolean;
  href: string;
  owner: string;
};

function uniqueModules(checks: ModuleReleaseCheck[]) {
  const modules = new Map<string, ModuleReleaseCheck>();
  for (const check of checks) {
    const current = modules.get(check.feature_key);
    if (!current || check.feature_sort_order < current.feature_sort_order) {
      modules.set(check.feature_key, check);
    }
  }
  return [...modules.values()];
}

export function LaunchReadinessSummary({
  environmentSignals,
  metrics,
  databaseChecks,
  moduleChecks,
  launchChecks,
  migrationsReady,
}: {
  environmentSignals: EnvironmentSignal[];
  metrics: ReadinessMetric[];
  databaseChecks: DatabaseReleaseCheck[];
  moduleChecks: ModuleReleaseCheck[];
  launchChecks: LaunchGateCheck[];
  migrationsReady: {
    database: boolean;
    modules: boolean;
    launch: boolean;
    reporting: boolean;
  };
}) {
  const moduleItems = uniqueModules(moduleChecks);
  const requiredLaunchChecks = launchChecks.filter((check) => check.required);
  const items: ReadinessItem[] = [
    ...environmentSignals.map((signal) => ({
      label: signal.label,
      detail: signal.ready
        ? "The production connection is responding."
        : "Finish the production setup and verify it from this workspace.",
      ready: signal.ready,
      href: "#launch-gates",
      owner: "You · Vercel or provider settings",
    })),
    ...(migrationsReady.reporting
      ? [
          ...metrics.map((metric) => ({
            label: metric.label,
            detail:
              metric.status === "ready"
                ? "The current target has been reached."
                : `Current ${metric.current_value.toLocaleString("en-KE")}; target ${metric.target_value.toLocaleString("en-KE")}.`,
            ready: metric.status === "ready",
            href: "#analytics",
            owner: "Admin · real member activity",
          })),
        ]
      : [
          {
            label: "Launch reporting",
            detail: "Apply the reporting migration before relying on activity evidence.",
            ready: false,
            href: "#analytics",
            owner: "You · Supabase",
          },
        ]),
    ...(migrationsReady.database
      ? databaseChecks.map((check) => ({
          label: check.label,
          detail: check.ready
            ? "Required tables and secure actions were found."
            : check.missing_items.length
              ? `${check.missing_items.length} database item${check.missing_items.length === 1 ? "" : "s"} still missing.`
              : "The database check needs attention.",
          ready: check.ready,
          href: "#database-readiness",
          owner: "You · Supabase migrations",
        }))
      : [
          {
            label: "Database structure",
            detail: "Apply the production database readiness migration, then reload.",
            ready: false,
            href: "#database-readiness",
            owner: "You · Supabase",
          },
        ]),
    ...(migrationsReady.modules
      ? moduleItems.map((module) => ({
          label: module.feature_label,
          detail: module.release_ready
            ? "Database dependencies and acceptance evidence are complete."
            : "Complete the database and real-use checks before opening this area.",
          ready: module.release_ready,
          href: "#module-release-gate",
          owner: module.owner_label ?? "Admin · feature acceptance",
        }))
      : [
          {
            label: "Feature release checks",
            detail: "Apply the module acceptance migration before opening member features.",
            ready: false,
            href: "#module-release-gate",
            owner: "You · Supabase",
          },
        ]),
    ...(migrationsReady.launch
      ? requiredLaunchChecks.map((check) => ({
          label: check.label,
          detail: check.status === "passed" ? "Evidence is recorded." : check.guidance,
          ready: check.status === "passed",
          href: "#launch-gates",
          owner: check.owner_label ?? "Admin · launch evidence",
        }))
      : [
          {
            label: "Launch evidence",
            detail: "Apply the launch-gate migration before recording sign-offs.",
            ready: false,
            href: "#launch-gates",
            owner: "You · Supabase",
          },
        ]),
  ];

  const readyCount = items.filter((item) => item.ready).length;
  const total = items.length;
  const percentage = total ? Math.round((readyCount / total) * 100) : 0;
  const remaining = items.filter((item) => !item.ready).slice(0, 5);
  const allReady = total > 0 && readyCount === total;

  return (
    <section className="admin-section launch-readiness-summary" id="launch-readiness-summary">
      <header className="launch-readiness-summary-heading">
        <div>
          <p className="eyebrow">Evidence, not guesswork</p>
          <h2>What still needs to happen before launch?</h2>
          <p>
            This view combines the live checks below. A check is only ready when its
            database dependency and real-use evidence are both complete.
          </p>
        </div>
        <aside className={allReady ? "ready" : "attention"}>
          <strong>{percentage}%</strong>
          <span>{readyCount} of {total} checks ready</span>
        </aside>
      </header>

      <div className="launch-readiness-summary-bar" aria-label={`${percentage}% ready`}>
        <span style={{ width: `${percentage}%` }} />
      </div>

      {allReady ? (
        <div className="launch-readiness-clear" role="status">
          <strong>All recorded checks are ready.</strong>
          <span>Complete the final live rehearsal and make the launch decision in Launch gates.</span>
        </div>
      ) : (
        <div className="launch-readiness-next">
          <div>
            <p className="eyebrow">Start here</p>
            <h3>Your next five actions</h3>
          </div>
          <ol>
            {remaining.map((item) => (
              <li key={`${item.href}-${item.label}`}>
                <span className="launch-readiness-dot" aria-hidden="true" />
                <div>
                  <a href={item.href}>{item.label}</a>
                  <p>{item.detail}</p>
                  <small>{item.owner}</small>
                </div>
              </li>
            ))}
          </ol>
          {!remaining.length ? <p>Open each section below to record the remaining evidence.</p> : null}
        </div>
      )}
    </section>
  );
}
