export type CommunityOutcome = {
  outcome_count: number;
  outcome_type: string;
};

const labels: Record<string, string> = {
  client: "Client conversations",
  collaboration: "Collaborations",
  friendship: "Friendships",
  investment: "Investment conversations",
  knowledge: "Knowledge shared",
  mentorship: "Mentorships",
  other: "Other meaningful outcomes",
  referral: "Referrals and introductions",
};

export function CommunityOutcomeSummary({
  outcomes,
  migrationReady,
}: {
  outcomes: CommunityOutcome[];
  migrationReady: boolean;
}) {
  if (!migrationReady)
    return (
      <section className="admin-section community-outcome-summary">
        <div className="admin-empty">
          <strong>Community outcomes are temporarily unavailable</strong>
          <p>
            Reload this workspace after the connection outcomes migration is
            active. No member information is exposed.
          </p>
        </div>
      </section>
    );

  const total = outcomes.reduce(
    (sum, outcome) => sum + Number(outcome.outcome_count),
    0,
  );

  return (
    <section className="admin-section community-outcome-summary">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Last 12 months · anonymous</p>
          <h2>What the community made possible</h2>
          <p>
            Members choose whether to contribute each outcome. This report
            contains category totals only—never names, relationship pairs, or
            private notes—and excludes every tagged test identity.
          </p>
        </div>
        <div className="outcome-total">
          <strong>{total.toLocaleString("en-KE")}</strong>
          <span>member-reported outcomes</span>
        </div>
      </div>
      {outcomes.length ? (
        <div className="community-outcome-grid">
          {outcomes.map((outcome) => (
            <article key={outcome.outcome_type}>
              <strong>
                {Number(outcome.outcome_count).toLocaleString("en-KE")}
              </strong>
              <span>{labels[outcome.outcome_type] ?? outcome.outcome_type}</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty">
          <strong>No anonymous outcomes recorded yet</strong>
          <p>
            Totals will appear after real members voluntarily record what their
            accepted connections led to.
          </p>
        </div>
      )}
    </section>
  );
}
