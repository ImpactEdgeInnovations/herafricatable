import type {
  OperationalCheck,
  OperationalHealth,
} from "@/lib/operational-health";

const statusLabels: Record<OperationalCheck["status"], string> = {
  attention: "Needs rehearsal",
  ready: "Verified now",
  unavailable: "Action required",
};

export function OperationalHealthPanel({
  assessment,
}: {
  assessment: OperationalHealth;
}) {
  const ready = assessment.checks.filter(
    (check) => check.status === "ready",
  ).length;
  const requiredFailures = assessment.checks.filter(
    (check) => check.required && check.status !== "ready",
  ).length;

  return (
    <section
      aria-labelledby="operational-health-title"
      className="admin-section operational-health"
      id="operational-health"
    >
      <div className="admin-section-heading operational-health-heading">
        <div>
          <p className="eyebrow">Live deployment assessment</p>
          <h2 id="operational-health-title">Can the platform operate safely?</h2>
          <p>
            These checks verify the current deployment boundary. Provider
            configuration is not treated as proof of a successful payment or
            delivered email.
          </p>
        </div>
        <div
          className={`operational-health-decision ${
            assessment.status === "ok" ? "ready" : "blocked"
          }`}
        >
          <strong>
            {assessment.status === "ok" ? "Core ready" : "Not ready"}
          </strong>
          <span>
            {requiredFailures
              ? `${requiredFailures} required check${requiredFailures === 1 ? "" : "s"} need attention`
              : `${ready}/${assessment.checks.length} checks verified now`}
          </span>
        </div>
      </div>

      <div className="operational-health-meta">
        <span>Release {assessment.release}</span>
        <span>
          Checked{" "}
          {new Intl.DateTimeFormat("en-KE", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(assessment.checkedAt))}
        </span>
        <span>{assessment.latencyMs} ms assessment</span>
      </div>

      <div className="operational-health-grid">
        {assessment.checks.map((check) => (
          <article className={check.status} key={check.key}>
            <header>
              <span>{statusLabels[check.status]}</span>
              <small>{check.required ? "Required now" : "Launch capability"}</small>
            </header>
            <h3>{check.label}</h3>
            <strong>{check.summary}</strong>
            <p>{check.guidance}</p>
          </article>
        ))}
      </div>

      <aside className="operational-health-note">
        <strong>What this does not prove</strong>
        <p>
          Before enabling automatic payments or email, record a real low-value
          transaction, signed webhook, delivered message and retry outcome in
          Launch gates below.
        </p>
      </aside>
    </section>
  );
}
