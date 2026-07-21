const phases = [
  { label: "Foundation", range: "Days 1–3", progress: 96, status: "Acceptance testing", detail: "Hosting, Supabase, authentication, roles, RLS and first admin." },
  { label: "Members", range: "Days 4–7", progress: 72, status: "Live testing", detail: "Onboarding, profiles, approvals, consent and admin operations." },
  { label: "Events", range: "Days 8–11", progress: 96, status: "Acceptance testing", detail: "Event lifecycle, scoped staff, programme, announcements, sponsors, menu and private-by-default galleries are operational." },
  { label: "Registration", range: "Days 12–15", progress: 91, status: "Acceptance testing", detail: "Tickets, orders, receipts, manual review, Paystack verification, refunds, reconciliation and idempotent entitlements are built." },
  { label: "Network", range: "Days 16–30", progress: 68, status: "Support operations", detail: "Discovery, connections, safety, private messaging and a member-owned support workflow with super-admin operations are built." },
];

export function RoadmapOverview() {
  return (
    <section className="admin-section roadmap-overview" id="roadmap" aria-labelledby="roadmap-title">
      <div className="admin-section-heading">
        <div><p className="eyebrow">30-day delivery</p><h2 id="roadmap-title">Launch roadmap</h2><p>A focused view of the production plan. Progress reflects completed code, not just designed screens.</p></div>
        <a href="https://github.com/ImpactEdgeInnovations/herafricatable/blob/main/docs/ROADMAP.md" target="_blank" rel="noreferrer">Full technical roadmap ↗</a>
      </div>
      <div className="roadmap-list">{phases.map((phase, index) => (
        <article key={phase.label}>
          <span className="roadmap-index">0{index + 1}</span>
          <div className="roadmap-copy"><div><h3>{phase.label}</h3><small>{phase.range}</small></div><p>{phase.detail}</p></div>
          <div className="roadmap-progress"><div><span style={{ width: `${phase.progress}%` }} /></div><small>{phase.progress}% · {phase.status}</small></div>
        </article>
      ))}</div>
    </section>
  );
}
