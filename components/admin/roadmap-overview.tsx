const phases = [
  { label: "Foundation", range: "Days 1–3", progress: 92, status: "In review", detail: "Hosting, Supabase, authentication, roles, RLS and first admin." },
  { label: "Members", range: "Days 4–7", progress: 42, status: "Building now", detail: "Onboarding, profiles, approvals, consent and admin operations." },
  { label: "Events", range: "Days 8–11", progress: 12, status: "Next", detail: "Event programme, announcements, menu, gallery and sponsors." },
  { label: "Registration", range: "Days 12–15", progress: 0, status: "Queued", detail: "Paystack, manual processing, entitlements and reconciliation." },
  { label: "Network", range: "Days 16–30", progress: 0, status: "Queued", detail: "Directory, connections, messaging, safety and launch hardening." },
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
