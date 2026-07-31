import Link from "next/link";

export type CommunityHostCapabilities = {
  plan_id: string | null;
  plan_name: string | null;
  plan_status: string | null;
  plan_ends_at: string | null;
  host_tools_active: boolean;
  paid_access: boolean;
  advanced_analytics: boolean;
  automations: boolean;
  multiple_moderators: boolean;
  max_moderators: number;
  current_moderators: number;
};

function date(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function CommunityHostCapabilitiesPanel({
  capabilities,
  migrationReady,
  owner,
}: {
  capabilities: CommunityHostCapabilities | null;
  migrationReady: boolean;
  owner: boolean;
}) {
  if (!migrationReady) {
    return (
      <section className="community-host-capabilities is-awaiting">
        <div>
          <p className="eyebrow">Your host tools</p>
          <h2>Plan controls are awaiting the latest update.</h2>
          <p>
            Admissions and programming remain available. Apply the latest
            entitlement migration before relying on plan limits.
          </p>
        </div>
      </section>
    );
  }

  const tools = [
    {
      active: true,
      detail: "Admissions, member roles and room programming",
      label: "Core stewardship",
    },
    {
      active: Boolean(capabilities?.advanced_analytics),
      detail: "Continuity, participation and privacy-safe outcomes",
      label: "Advanced insights",
    },
    {
      active: Boolean(capabilities?.automations),
      detail: "Gentle member reminders with rate limits",
      label: "Host reminders",
    },
    {
      active: Boolean(capabilities?.paid_access),
      detail: "Paid offers, member checkout and creator statements",
      label: "Paid community",
    },
  ];

  return (
    <section className="community-host-capabilities">
      <header>
        <div>
          <p className="eyebrow">Your host tools</p>
          <h2>{capabilities?.plan_name ?? "Core steward access"}</h2>
          <p>
            {capabilities?.host_tools_active
              ? `Active${date(capabilities.plan_ends_at) ? ` until ${date(capabilities.plan_ends_at)}` : ""}. Your room keeps its core stewardship tools even when optional capabilities differ by plan.`
              : "No paid host plan is active. You can prepare the room, review admissions and work with one moderator."}
          </p>
        </div>
        {owner ? (
          <a className="button button-outline" href="#commerce">
            {capabilities?.host_tools_active
              ? "Review or change plan"
              : "Choose a host plan"}
          </a>
        ) : (
          <Link className="button button-outline" href="/support">
            Ask about host tools
          </Link>
        )}
      </header>

      <div className="community-host-capability-grid">
        {tools.map((tool) => (
          <article className={tool.active ? "is-included" : ""} key={tool.label}>
            <span aria-hidden="true">{tool.active ? "✓" : "—"}</span>
            <div>
              <strong>{tool.label}</strong>
              <p>{tool.detail}</p>
            </div>
            <small>{tool.active ? "Included" : "Upgrade"}</small>
          </article>
        ))}
      </div>

      <footer>
        <span>Moderator seats</span>
        <strong>
          {capabilities?.current_moderators ?? 0} of{" "}
          {capabilities?.max_moderators ?? 1} used
        </strong>
        <div aria-hidden="true">
          <i
            style={{
              width: `${Math.min(
                100,
                ((capabilities?.current_moderators ?? 0) /
                  Math.max(capabilities?.max_moderators ?? 1, 1)) *
                  100,
              )}%`,
            }}
          />
        </div>
      </footer>
    </section>
  );
}
