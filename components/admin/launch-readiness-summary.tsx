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
  return [...modules.values()].map((module) => ({ ...module,
    release_ready: checks.filter((check) => check.feature_key === module.feature_key)
      .every((check) => check.release_ready && check.database_ready && check.status === "passed"),
  }));
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
  const missingGroups = [
    !environmentSignals.length ? "Connection checks" : null,
    !migrationsReady.reporting || !metrics.length ? "Member activity targets" : null,
    !migrationsReady.database || !databaseChecks.length ? "Database checks" : null,
    !migrationsReady.modules || !moduleChecks.length ? "Feature acceptance" : null,
    !migrationsReady.launch || !requiredLaunchChecks.length ? "Required launch evidence" : null,
  ].filter((group): group is string => group !== null);
  const inputsComplete = missingGroups.length === 0;
  const items: ReadinessItem[] = [
    ...(environmentSignals.length ? environmentSignals.map((signal) => ({
      label: signal.label,
      detail: signal.ready
        ? "The connection or setup check passed. Confirm real delivery and use in the evidence below."
        : "Finish the production setup and verify it from this workspace.",
      ready: signal.ready,
      href: "#launch-gates",
      owner: "You · Vercel or provider settings",
    })) : [{ label: "Connection checks", detail: "These checks couldn’t load. Reload this workspace before relying on the summary.", ready: false, href: "#launch-gates", owner: "Admin · connection checks" }]),
    ...(migrationsReady.reporting && metrics.length
      ? [
          ...metrics.map((metric) => ({
            label: metric.label,
            detail:
              metric.status === "ready"
                ? "The current target has been reached."
                : `Current ${metric.current_value.toLocaleString("en-KE")}; target ${metric.target_value.toLocaleString("en-KE")}.`,
            ready: metric.status === "ready",
            href: "/admin/operations?area=people-and-launch#analytics",
            owner: "Admin · real member activity",
          })),
        ]
      : [
          {
            label: "Launch reporting",
            detail: "Activity targets couldn’t load. Reload the workspace; no target has been changed.",
            ready: false,
            href: "/admin/operations?area=people-and-launch#analytics",
            owner: "You · Supabase",
          },
        ]),
    ...(migrationsReady.database && databaseChecks.length
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
            detail: "Database checks couldn’t load. Reload the workspace before deciding an update is needed.",
            ready: false,
            href: "#database-readiness",
            owner: "You · Supabase",
          },
        ]),
    ...(migrationsReady.modules && moduleChecks.length
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
            detail: "Feature checks couldn’t load. Reload the workspace; do not open a feature based on this incomplete view.",
            ready: false,
            href: "#module-release-gate",
            owner: "You · Supabase",
          },
        ]),
    ...(migrationsReady.launch && requiredLaunchChecks.length
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
            detail: "Required launch checks couldn’t load. Reload the workspace before recording a sign-off.",
            ready: false,
            href: "#launch-gates",
            owner: "You · Supabase",
          },
        ]),
  ];

  const readyCount = items.filter((item) => item.ready).length;
  const total = items.length;
  const percentage = inputsComplete && total ? Math.round((readyCount / total) * 100) : null;
  const remaining = items.filter((item) => !item.ready).slice(0, 5);
  const allReady = inputsComplete && total > 0 && readyCount === total;

  return (
    <section className="admin-section launch-readiness-summary" id="launch-readiness-summary">
      <header className="launch-readiness-summary-heading">
        <div>
          <p className="eyebrow">Evidence, not guesswork</p>
          <h2>Launch checks at a glance</h2>
          <p>
            Setup, database checks, member activity targets, feature acceptance and launch
            evidence are counted separately below. This is recorded checklist progress—not
            the percentage of code finished or permission to go live.
          </p>
        </div>
        <aside className={allReady ? "ready" : "attention"}>
          <strong>{percentage === null ? "—" : `${percentage}%`}</strong>
          <span>{percentage === null ? "Snapshot incomplete" : `${readyCount} of ${total} recorded checks ready`}</span>
        </aside>
      </header>

      {percentage !== null ? <div className="launch-readiness-summary-bar" aria-label={`${percentage}% of recorded checks ready`}>
        <span style={{ width: `${percentage}%` }} />
      </div> : <div className="admin-empty" role="alert"><strong>Some checks couldn’t load</strong><p>No overall percentage is shown because these groups are unavailable: {missingGroups.join(", ")}. Reload the workspace to try again. Existing settings and sign-offs are unchanged.</p></div>}

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
