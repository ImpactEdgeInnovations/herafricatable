type AdminRole = "super_admin" | "event_staff" | "moderator";

type ActionItem = {
  count: number;
  description: string;
  href: string;
  label: string;
};

export function AdminActionCentre({
  draftEvents,
  hasEvents,
  openReports,
  pendingMembers,
  pendingCommunityApplications,
  pendingRefunds,
  pendingRegistrations,
  role,
}: {
  draftEvents: number;
  hasEvents: boolean;
  openReports: number;
  pendingMembers: number;
  pendingCommunityApplications: number;
  pendingRefunds: number;
  pendingRegistrations: number;
  role: AdminRole;
}) {
  const actions: ActionItem[] = [];

  if (role === "super_admin") {
    actions.push(
      {
        count: pendingMembers,
        description: pendingMembers
          ? "Approve or decline new membership access."
          : "No new membership decisions are waiting.",
        href: "/admin/members",
        label: "Membership requests",
      },
      {
        count: pendingCommunityApplications,
        description: pendingCommunityApplications
          ? "Review who wants to start a Community and why."
          : "No new Community proposals are waiting.",
        href: "/admin/communities#community-applications",
        label: "Community proposals",
      },
    );
  }

  if (role !== "moderator") {
    const registrationHref = "/admin/events";
    actions.push(
      {
        count: pendingRegistrations,
        description: pendingRegistrations
          ? "Check payment evidence and complete each review."
          : hasEvents
            ? "Every registration review is up to date."
            : "Create the first event to open registration.",
        href: registrationHref,
        label: "Registration reviews",
      },
      {
        count: pendingRefunds,
        description: pendingRefunds
          ? "Review refund requests before processing them."
          : hasEvents
            ? "There are no refund requests waiting."
            : "Refunds will appear after event registration begins.",
        href: registrationHref,
        label: "Refund requests",
      },
      {
        count: draftEvents,
        description: draftEvents
          ? "Finish event details before publishing."
          : "There are no draft events requiring attention.",
        href: "/admin/events",
        label: "Draft events",
      },
    );
  }

  if (role !== "event_staff") {
    actions.push({
      count: openReports,
      description: openReports
        ? "Review member, marketplace and community reports."
        : "All safety report queues are clear.",
      href: "/admin/safety",
      label: "Safety reports",
    });
  }

  const total = actions.reduce((sum, action) => sum + action.count, 0);
  const openActions = actions.filter((action) => action.count > 0);

  return (
    <section
      className="admin-action-centre"
      id="actions"
      aria-labelledby="admin-actions-title"
    >
      <header>
        <div>
          <p className="eyebrow">Start here</p>
          <h2 id="admin-actions-title">What needs your attention</h2>
          <p>
            These live queues show the work that may need a decision. Choose a
            card to go directly to it.
          </p>
        </div>
        <span className={total ? "has-work" : "all-clear"}>
          {total ? `${total} open task${total === 1 ? "" : "s"}` : "All clear"}
        </span>
      </header>
      {openActions.length ? (
        <div className="admin-action-grid">
          {openActions.map((action) => (
            <a className="has-work" href={action.href} key={action.label}>
              <span>{action.count}</span>
              <strong>{action.label}</strong>
              <p>{action.description}</p>
              <small>
                Review now{" "}
                <span aria-hidden="true">→</span>
              </small>
            </a>
          ))}
        </div>
      ) : (
        <div className="admin-action-clear">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Nothing needs a decision right now.</strong>
            <p>Use the work areas below whenever you need to make an update.</p>
          </div>
        </div>
      )}
    </section>
  );
}
