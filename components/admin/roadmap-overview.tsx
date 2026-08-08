const phases = [
  {
    label: "Foundation",
    range: "Days 1–3",
    progress: 100,
    status: "Ready",
    detail:
      "Hosting, sign-in, staff access, system checks, private reporting and security tests are built.",
  },
  {
    label: "Members",
    range: "Days 4–7",
    progress: 91,
    status: "Ready for member testing",
    detail:
      "Joining, profiles, approvals, privacy choices and membership renewals are built.",
  },
  {
    label: "Events",
    range: "Days 8–11",
    progress: 96,
    status: "Ready for full testing",
    detail:
      "Creating events, staff access, programmes, announcements, sponsors, menus and private galleries are built.",
  },
  {
    label: "Registration",
    range: "Days 12–15",
    progress: 91,
    status: "Ready for payment testing",
    detail:
      "Tickets, orders, receipts, manual payments, Paystack checks and refunds are built.",
  },
  {
    label: "Network",
    range: "Days 16–30",
    progress: 99,
    status: "Needs final live testing",
    detail:
      "Opportunities, feedback, Communities, founding-member invitations, Learning, referrals, renewals, Circles and partner benefits are built. Final live testing remains.",
  },
  {
    label: "Experience",
    range: "Every day",
    progress: 98,
    status: "Ready for member review",
    detail:
      "Member Home gives each woman a clear next step. Nairobi invitations and introductions are ready. Real-device and non-technical member testing remain.",
  },
];

export function RoadmapOverview() {
  return (
    <section
      className="admin-section roadmap-overview"
      id="roadmap"
      aria-labelledby="roadmap-title"
    >
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">30-day delivery</p>
          <h2 id="roadmap-title">Launch roadmap</h2>
          <p>
            A simple view of what is built, what has been tested and what still
            needs a real member check.
          </p>
        </div>
        <a
          href="https://github.com/ImpactEdgeInnovations/herafricatable/blob/main/docs/ROADMAP.md"
          target="_blank"
          rel="noreferrer"
        >
          Full technical roadmap ↗
        </a>
      </div>
      <div className="roadmap-list">
        {phases.map((phase, index) => (
          <article key={phase.label}>
            <span className="roadmap-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="roadmap-copy">
              <div>
                <h3>{phase.label}</h3>
                <small>{phase.range}</small>
              </div>
              <p>{phase.detail}</p>
            </div>
            <div className="roadmap-progress">
              <div>
                <span style={{ width: `${phase.progress}%` }} />
              </div>
              <small>
                {phase.progress}% · {phase.status}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
