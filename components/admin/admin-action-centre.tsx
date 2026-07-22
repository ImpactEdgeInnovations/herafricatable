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
  pendingRefunds,
  pendingRegistrations,
  role,
}: {
  draftEvents: number;
  hasEvents: boolean;
  openReports: number;
  pendingMembers: number;
  pendingRefunds: number;
  pendingRegistrations: number;
  role: AdminRole;
}) {
  const actions: ActionItem[] = [];

  if (role === "super_admin") {
    actions.push({
      count: pendingMembers,
      description: pendingMembers ? "Approve or decline new membership access." : "No new membership decisions are waiting.",
      href: "#members",
      label: "Membership requests",
    });
  }

  if (role !== "moderator") {
    const registrationHref = hasEvents ? "#registrations" : "#events";
    actions.push(
      {
        count: pendingRegistrations,
        description: pendingRegistrations ? "Check payment evidence and complete each review." : hasEvents ? "Every registration review is up to date." : "Create the first event to open registration.",
        href: registrationHref,
        label: "Registration reviews",
      },
      {
        count: pendingRefunds,
        description: pendingRefunds ? "Review refund requests before processing them." : hasEvents ? "There are no refund requests waiting." : "Refunds will appear after event registration begins.",
        href: registrationHref,
        label: "Refund requests",
      },
      {
        count: draftEvents,
        description: draftEvents ? "Finish event details before publishing." : "There are no draft events requiring attention.",
        href: "#events",
        label: "Draft events",
      },
    );
  }

  if (role !== "event_staff") {
    actions.push({
      count: openReports,
      description: openReports ? "Review member, marketplace and community reports." : "All safety report queues are clear.",
      href: "#moderation",
      label: "Safety reports",
    });
  }

  const total = actions.reduce((sum, action) => sum + action.count, 0);

  return (
    <section className="admin-action-centre" id="actions" aria-labelledby="admin-actions-title">
      <header>
        <div>
          <p className="eyebrow">Start here</p>
          <h2 id="admin-actions-title">What needs your attention</h2>
          <p>These live queues show the work that may need a decision. Choose a card to go directly to it.</p>
        </div>
        <span className={total ? "has-work" : "all-clear"}>{total ? `${total} open task${total === 1 ? "" : "s"}` : "All clear"}</span>
      </header>
      <div className="admin-action-grid">
        {actions.map((action) => (
          <a className={action.count ? "has-work" : "all-clear"} href={action.href} key={action.label}>
            <span>{action.count}</span>
            <strong>{action.label}</strong>
            <p>{action.description}</p>
            <small>{action.count ? "Review now" : "View area"} <span aria-hidden="true">→</span></small>
          </a>
        ))}
      </div>
    </section>
  );
}
