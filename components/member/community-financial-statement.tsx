"use client";

export type CommunityFinancialSummary = {
  currency: string;
  gross_minor: number;
  platform_fee_minor: number;
  provider_fee_minor: number;
  tax_withheld_minor: number;
  refund_minor: number;
  dispute_held_minor: number;
  reserve_held_minor: number;
  settled_minor: number;
  available_minor: number;
  open_cases: number;
};

export type CommunityStatementEntry = {
  transaction_at: string;
  order_reference: string;
  entry_kind: string;
  description: string;
  credit_minor: number;
  debit_minor: number;
  currency: string;
  source_reference: string;
};

export type CommunitySettlement = {
  batch_id: string;
  reference: string;
  currency: string;
  amount_minor: number;
  period_ends_at: string;
  status: string;
  provider: string;
  provider_settlement_reference: string | null;
  created_at: string;
  paid_at: string | null;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-KE", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount / 100);
}

function csvCell(value: string | number | null) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null>>) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CommunityFinancialStatement({
  entries,
  migrationReady,
  settlements,
  summaries,
}: {
  entries: CommunityStatementEntry[];
  migrationReady: boolean;
  settlements: CommunitySettlement[];
  summaries: CommunityFinancialSummary[];
}) {
  if (!migrationReady) return null;

  function exportStatement() {
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`her-africa-table-community-statement-${date}.csv`, [
      ["Transaction date", "Order reference", "Type", "Description", "Credit minor", "Debit minor", "Currency", "Source reference"],
      ...entries.map((entry) => [
        entry.transaction_at,
        entry.order_reference,
        entry.entry_kind,
        entry.description,
        entry.credit_minor,
        entry.debit_minor,
        entry.currency,
        entry.source_reference,
      ]),
    ]);
  }

  return (
    <section className="community-financial-statement" id="statement">
      <div className="community-financial-heading">
        <div>
          <p className="eyebrow">Community earnings</p>
          <h2>See where every payment goes.</h2>
          <p>
            Member payments, fees, refunds, held amounts and completed payouts
            appear separately. “Available” means ready for payout—not yet sent.
          </p>
        </div>
        <div className="community-financial-actions">
          <span>Payouts reviewed manually</span>
          <button
            className="button button-outline"
            disabled={!entries.length}
            onClick={exportStatement}
            type="button"
          >
            Download statement CSV
          </button>
          <small>
            Operational statement only. A legally approved tax invoice format
            will be introduced after tax review.
          </small>
        </div>
      </div>

      {summaries.length ? (
        summaries.map((summary) => (
          <div className="community-financial-summary" key={summary.currency}>
            <article className="primary">
              <span>Available for payout</span>
              <strong>
                {money(summary.available_minor, summary.currency)}
              </strong>
              <small>{summary.currency} · not yet sent</small>
            </article>
            <article>
              <span>Gross member payments</span>
              <strong>{money(summary.gross_minor, summary.currency)}</strong>
              <small>
                Platform fee{" "}
                {money(summary.platform_fee_minor, summary.currency)}
              </small>
            </article>
            <article>
              <span>Payment costs and refunds</span>
              <strong>
                {money(
                  summary.provider_fee_minor +
                    summary.tax_withheld_minor +
                    summary.refund_minor,
                  summary.currency,
                )}
              </strong>
              <small>
                {summary.open_cases
                  ? `${summary.open_cases} open case${summary.open_cases === 1 ? "" : "s"}`
                  : "No open cases"}
              </small>
            </article>
            <article>
              <span>Paid out</span>
              <strong>{money(summary.settled_minor, summary.currency)}</strong>
              <small>
                Holds{" "}
                {money(
                  summary.dispute_held_minor + summary.reserve_held_minor,
                  summary.currency,
                )}
              </small>
            </article>
          </div>
        ))
      ) : (
        <div className="community-statement-empty">
          <strong>Your statement begins with the first paid member.</strong>
          <p>
            Free community activity does not create a financial transaction.
          </p>
        </div>
      )}

      <div className="community-statement-layout">
        <div className="community-statement-entries">
          <div>
            <p className="eyebrow">Transaction history</p>
            <h3>Recent payments and adjustments</h3>
          </div>
          {entries.length ? (
            <div className="community-statement-table">
              {entries.map((entry, index) => (
                <article
                  key={`${entry.source_reference}-${entry.entry_kind}-${index}`}
                >
                  <div>
                    <strong>{entry.description}</strong>
                    <span>
                      {entry.order_reference} ·{" "}
                      {new Date(entry.transaction_at).toLocaleDateString(
                        "en-KE",
                        { dateStyle: "medium" },
                      )}
                    </span>
                  </div>
                  <b className={entry.credit_minor ? "credit" : "debit"}>
                    {entry.credit_minor ? "+" : "−"}
                    {money(
                      entry.credit_minor || entry.debit_minor,
                      entry.currency,
                    )}
                  </b>
                </article>
              ))}
            </div>
          ) : (
            <div className="community-statement-empty compact">
              <strong>No statement entries yet</strong>
              <p>Verified member payments will appear here automatically.</p>
            </div>
          )}
        </div>

        <aside className="community-settlement-history">
          <div>
            <p className="eyebrow">Payouts</p>
            <h3>Approved and completed</h3>
          </div>
          {settlements.length ? (
            settlements.map((settlement) => (
              <article key={settlement.batch_id}>
                <div>
                  <strong>{settlement.reference}</strong>
                  <span>{settlement.status}</span>
                </div>
                <b>
                  {money(settlement.amount_minor, settlement.currency)}
                </b>
                <small>
                  {settlement.paid_at
                    ? `Paid ${new Date(settlement.paid_at).toLocaleDateString("en-KE", { dateStyle: "medium" })}`
                    : "Approved for settlement"}
                </small>
              </article>
            ))
          ) : (
            <div className="community-statement-empty compact">
              <strong>No payouts yet</strong>
              <p>
                A payout appears here after your details are verified and our
                team approves it.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
