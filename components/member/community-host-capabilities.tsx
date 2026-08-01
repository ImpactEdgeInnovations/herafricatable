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
          <p className="eyebrow">Plans &amp; tools</p>
          <h2>Your plan details are not ready yet.</h2>
          <p>
            You can still manage join requests, members, events and learning.
            Plan limits will appear here when setup is complete.
          </p>
        </div>
      </section>
    );
  }

  const tools = [
    {
      active: true,
      detail: "Join requests, member roles, events and learning",
      label: "Community management",
    },
    {
      active: Boolean(capabilities?.advanced_analytics),
      detail: "Return rates, participation and anonymous member results",
      label: "Member health insights",
    },
    {
      active: Boolean(capabilities?.automations),
      detail: "Careful introduction reminders with sending limits",
      label: "Member reminders",
    },
    {
      active: Boolean(capabilities?.paid_access),
      detail: "Paid memberships, secure checkout and earnings",
      label: "Paid memberships",
    },
  ];

  return (
    <section className="community-host-capabilities">
      <header>
        <div>
          <p className="eyebrow">Plans &amp; tools</p>
          <h2>{capabilities?.plan_name ?? "Community management"}</h2>
          <p>
            {capabilities?.host_tools_active
              ? `Active${date(capabilities.plan_ends_at) ? ` until ${date(capabilities.plan_ends_at)}` : ""}. Your essential community controls remain available even when optional tools differ by plan.`
              : "No paid community plan is active. You can set up the community, review join requests and work with one moderator."}
          </p>
        </div>
        {owner ? (
          <a className="button button-outline" href="#commerce">
            {capabilities?.host_tools_active
              ? "Review or change plan"
              : "Choose a community plan"}
          </a>
        ) : (
          <Link className="button button-outline" href="/support">
            Ask about plans and tools
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
        <span>Moderator places</span>
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
