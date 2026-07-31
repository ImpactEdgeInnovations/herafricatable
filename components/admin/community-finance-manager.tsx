"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunityFinanceSummaryAdmin = {
  community_id: string;
  community_name: string;
  community_slug: string;
  owner_email: string | null;
  currency: string;
  gross_minor: number;
  available_minor: number;
  settled_minor: number;
  open_cases: number;
  payout_status: string;
};

export type CommunityFinancialCaseAdmin = {
  case_id: string;
  community_id: string;
  community_name: string;
  order_id: string;
  order_reference: string;
  member_email: string;
  case_type: "refund" | "dispute";
  status: string;
  amount_minor: number;
  host_impact_minor: number;
  currency: string;
  provider: string;
  provider_case_reference: string;
  opened_note: string;
  opened_at: string;
};

export type CommunitySettlementAdmin = {
  batch_id: string;
  reference: string;
  community_id: string;
  community_name: string;
  owner_email: string;
  currency: string;
  amount_minor: number;
  period_ends_at: string;
  status: "draft" | "approved" | "paid" | "cancelled";
  provider: "paystack" | "manual";
  provider_settlement_reference: string | null;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
};

export type CommunityFinanceOrder = {
  order_id: string;
  reference: string;
  community_id: string;
  community_name: string;
  status: string;
  total_minor: number;
  currency: string;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-KE", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount / 100);
}

const openStatuses = new Set([
  "pending",
  "processing",
  "needs_attention",
  "open",
  "under_review",
]);

export function CommunityFinanceManager({
  cases,
  migrationReady,
  orders,
  settlements,
  summaries,
}: {
  cases: CommunityFinancialCaseAdmin[];
  migrationReady: boolean;
  orders: CommunityFinanceOrder[];
  settlements: CommunitySettlementAdmin[];
  summaries: CommunityFinanceSummaryAdmin[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selectedCommunityId, setSelectedCommunityId] = useState(
    summaries[0]?.community_id ?? "",
  );

  if (!migrationReady) {
    return (
      <section className="admin-section" id="community-finance-admin">
        <div className="admin-empty">
          <strong>Creator reconciliation controls are not installed yet</strong>
          <p>
            Existing earnings remain held. No creator payout can be marked paid
            until the append-only finance migration is installed.
          </p>
        </div>
      </section>
    );
  }

  const selectedSummary =
    summaries.find(
      (summary) => summary.community_id === selectedCommunityId,
    ) ?? summaries[0];
  const eligibleOrders = orders.filter((order) =>
    ["fulfilled", "refund_pending", "refunded"].includes(order.status),
  );
  const selectedOrders = eligibleOrders.filter(
    (order) =>
      !selectedCommunityId || order.community_id === selectedCommunityId,
  );
  const pendingCases = cases.filter((item) => openStatuses.has(item.status));

  async function recordAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("adjustment");
    setMessage("");
    const { error } = await supabase.rpc(
      "record_community_financial_adjustment",
      {
        p_amount_minor: Math.round(Number(form.get("amount")) * 100),
        p_entry_type: form.get("entryType"),
        p_note: form.get("note"),
        p_order_id: form.get("orderId"),
        p_source_provider: form.get("provider"),
        p_source_reference: form.get("reference"),
      },
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "record this financial adjustment")
        : "Append-only statement adjustment recorded and audited.",
    );
    if (!error) router.refresh();
  }

  async function openCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("case");
    setMessage("");
    const { error } = await supabase.rpc("open_community_financial_case", {
      p_amount_minor: Math.round(Number(form.get("amount")) * 100),
      p_case_type: form.get("caseType"),
      p_note: form.get("note"),
      p_order_id: form.get("orderId"),
      p_provider: form.get("provider"),
      p_provider_case_reference: form.get("reference"),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "open this financial case")
        : "Financial case opened. Dispute funds are held immediately.",
    );
    if (!error) router.refresh();
  }

  async function reviewCase(
    financialCase: CommunityFinancialCaseAdmin,
    action: string,
  ) {
    const answer = await ask({
      title:
        financialCase.case_type === "refund"
          ? `${action === "complete" ? "Complete" : "Update"} this refund?`
          : `Mark this dispute ${action === "win" ? "won" : "lost"}?`,
      description:
        financialCase.case_type === "refund" && action === "complete"
          ? "Only use Complete after the provider or manual refund has actually finished. A full refund revokes paid access."
          : "This decision changes the creator statement and is permanently audited.",
      confirmLabel:
        action === "complete"
          ? "Confirm processed refund"
          : action === "win"
            ? "Release dispute hold"
            : action === "lose"
              ? "Confirm dispute loss"
              : "Save case decision",
      fields: [
        {
          label: "Review note",
          minLength: 5,
          name: "note",
          required: true,
          type: "textarea",
        },
      ],
      tone: ["lose", "reject"].includes(action) ? "danger" : "default",
    });
    if (!answer) return;
    setBusy(financialCase.case_id);
    setMessage("");
    const { error } = await supabase.rpc(
      "review_community_financial_case",
      {
        p_action: action,
        p_case_id: financialCase.case_id,
        p_note: String(answer.note ?? ""),
      },
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "review this financial case")
        : "Financial case updated and statement impact reconciled.",
    );
    if (!error) router.refresh();
  }

  async function createSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedPeriodEnd = new Date(
      `${String(form.get("periodEnd"))}T23:59:59.999+03:00`,
    );
    const periodEnd =
      selectedPeriodEnd.getTime() > Date.now()
        ? new Date()
        : selectedPeriodEnd;
    setBusy("settlement");
    setMessage("");
    const { error } = await supabase.rpc(
      "create_community_settlement_batch",
      {
        p_community_id: form.get("communityId"),
        p_currency: form.get("currency"),
        p_note: form.get("note"),
        p_period_ends_at: periodEnd.toISOString(),
        p_provider: form.get("provider"),
      },
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "create this settlement batch")
        : "Draft settlement created from the currently reconciled balance.",
    );
    if (!error) router.refresh();
  }

  async function reviewSettlement(
    settlement: CommunitySettlementAdmin,
    action: "approve" | "cancel",
  ) {
    const answer = await ask({
      title:
        action === "approve"
          ? "Approve this creator settlement?"
          : "Cancel this settlement batch?",
      description:
        action === "approve"
          ? "Approval does not send money. A provider reference is still required after the transfer is completed."
          : "Cancellation removes the reservation without changing any statement entry.",
      confirmLabel: action === "approve" ? "Approve batch" : "Cancel batch",
      fields: [
        {
          label: "Decision note",
          minLength: 5,
          name: "note",
          required: true,
          type: "textarea",
        },
      ],
      tone: action === "cancel" ? "danger" : "default",
    });
    if (!answer) return;
    setBusy(settlement.batch_id);
    setMessage("");
    const { error } = await supabase.rpc(
      "review_community_settlement_batch",
      {
        p_action: action,
        p_batch_id: settlement.batch_id,
        p_note: String(answer.note ?? ""),
      },
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, `${action} this settlement batch`)
        : `Settlement batch ${action === "approve" ? "approved" : "cancelled"}.`,
    );
    if (!error) router.refresh();
  }

  async function markPaid(settlement: CommunitySettlementAdmin) {
    const answer = await ask({
      title: "Mark this creator settlement paid?",
      description:
        "Do this only after the transfer is confirmed outside the platform. The provider reference becomes part of the permanent statement.",
      confirmLabel: "Record paid settlement",
      fields: [
        {
          label: "Provider settlement reference",
          minLength: 3,
          name: "reference",
          required: true,
          type: "text",
        },
        {
          label: "Payment note",
          minLength: 5,
          name: "note",
          required: true,
          type: "textarea",
        },
      ],
    });
    if (!answer) return;
    setBusy(settlement.batch_id);
    setMessage("");
    const { error } = await supabase.rpc(
      "mark_community_settlement_paid",
      {
        p_batch_id: settlement.batch_id,
        p_note: String(answer.note ?? ""),
        p_provider_reference: String(answer.reference ?? ""),
      },
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "mark this settlement paid")
        : "Paid settlement recorded and the host has been notified.",
    );
    if (!error) router.refresh();
  }

  return (
    <section
      className="admin-section community-finance-admin"
      id="community-finance-admin"
    >
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Money controls</p>
          <h2>Creator reconciliation</h2>
          <p>
            Separate payment income from provider fees, refunds, disputes,
            reserves and settlements. Every balance movement is append-only.
          </p>
        </div>
        <span className="community-commerce-status">
          Automatic payouts off
        </span>
      </div>

      <div className="finance-admin-summary">
        <label>
          Community balance
          <select
            value={selectedCommunityId}
            onChange={(event) => setSelectedCommunityId(event.target.value)}
          >
            {summaries.map((summary) => (
              <option
                key={`${summary.community_id}-${summary.currency}`}
                value={summary.community_id}
              >
                {summary.community_name} · {summary.currency}
              </option>
            ))}
          </select>
        </label>
        {selectedSummary ? (
          <div>
            <article>
              <span>Available</span>
              <strong>
                {money(
                  selectedSummary.available_minor,
                  selectedSummary.currency,
                )}
              </strong>
            </article>
            <article>
              <span>Paid</span>
              <strong>
                {money(
                  selectedSummary.settled_minor,
                  selectedSummary.currency,
                )}
              </strong>
            </article>
            <article>
              <span>Open cases</span>
              <strong>{selectedSummary.open_cases}</strong>
            </article>
            <article>
              <span>Payout review</span>
              <strong>{selectedSummary.payout_status}</strong>
            </article>
          </div>
        ) : (
          <div className="admin-empty">
            <strong>No creator revenue yet</strong>
            <p>The first fulfilled paid community order starts this ledger.</p>
          </div>
        )}
      </div>

      <div className="finance-admin-tools">
        <form onSubmit={recordAdjustment}>
          <div>
            <p className="eyebrow">Statement adjustment</p>
            <h3>Record a verified cost or reserve</h3>
          </div>
          <label>
            Community order
            <select name="orderId" required>
              <option value="">Choose order</option>
              {selectedOrders.map((order) => (
                <option key={order.order_id} value={order.order_id}>
                  {order.reference} ·{" "}
                  {money(order.total_minor, order.currency)}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-form-row">
            <label>
              Adjustment
              <select name="entryType">
                <option value="provider_fee">Provider fee</option>
                <option value="tax_withheld">Tax withheld</option>
                <option value="reserve_hold">Reserve hold</option>
                <option value="reserve_release">Reserve release</option>
              </select>
            </label>
            <label>
              Amount
              <input min={0.01} name="amount" required step="0.01" type="number" />
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              Source
              <select name="provider">
                <option value="paystack">Paystack</option>
                <option value="manual">Manual</option>
                <option value="platform">Platform</option>
              </select>
            </label>
            <label>
              External reference
              <input minLength={3} name="reference" required />
            </label>
          </div>
          <label>
            Reconciliation note
            <textarea minLength={5} name="note" required />
          </label>
          <button disabled={busy === "adjustment"}>
            {busy === "adjustment" ? "Recording…" : "Record adjustment"}
          </button>
        </form>

        <form onSubmit={openCase}>
          <div>
            <p className="eyebrow">Refund or dispute</p>
            <h3>Open a manual financial case</h3>
          </div>
          <label>
            Community order
            <select name="orderId" required>
              <option value="">Choose order</option>
              {selectedOrders.map((order) => (
                <option key={order.order_id} value={order.order_id}>
                  {order.reference} · {order.status}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-form-row">
            <label>
              Case
              <select name="caseType">
                <option value="refund">Refund</option>
                <option value="dispute">Dispute</option>
              </select>
            </label>
            <label>
              Customer amount
              <input min={0.01} name="amount" required step="0.01" type="number" />
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              Provider
              <select name="provider">
                <option value="paystack">Paystack</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label>
              Case reference
              <input minLength={2} name="reference" required />
            </label>
          </div>
          <label>
            Opening note
            <textarea minLength={5} name="note" required />
          </label>
          <button disabled={busy === "case"}>
            {busy === "case" ? "Opening…" : "Open financial case"}
          </button>
        </form>

        <form onSubmit={createSettlement}>
          <div>
            <p className="eyebrow">Creator settlement</p>
            <h3>Build from reconciled funds</h3>
          </div>
          <input
            name="communityId"
            type="hidden"
            value={selectedSummary?.community_id ?? ""}
          />
          <input
            name="currency"
            type="hidden"
            value={selectedSummary?.currency ?? "KES"}
          />
          <label>
            Include transactions through
            <input
              defaultValue={new Date().toISOString().slice(0, 10)}
              max={new Date().toISOString().slice(0, 10)}
              name="periodEnd"
              required
              type="date"
            />
          </label>
          <label>
            Settlement provider
            <select name="provider">
              <option value="manual">Manual transfer</option>
              <option value="paystack">Paystack settlement</option>
            </select>
          </label>
          <label>
            Batch note
            <textarea
              minLength={5}
              name="note"
              placeholder="Period and reconciliation evidence checked"
              required
            />
          </label>
          <button
            disabled={!selectedSummary || busy === "settlement"}
          >
            {busy === "settlement" ? "Building…" : "Create draft settlement"}
          </button>
          <small>
            Drafting never sends money. Open cases and unverified payout
            profiles block settlement.
          </small>
        </form>
      </div>

      <div className="finance-case-queue">
        <div>
          <p className="eyebrow">Case queue</p>
          <h3>{pendingCases.length} requiring attention</h3>
        </div>
        {pendingCases.length ? (
          pendingCases.map((financialCase) => (
            <article key={financialCase.case_id}>
              <div>
                <strong>
                  {financialCase.community_name} ·{" "}
                  {financialCase.case_type}
                </strong>
                <span>
                  {financialCase.order_reference} ·{" "}
                  {financialCase.member_email}
                </span>
                <small>
                  Customer {money(financialCase.amount_minor, financialCase.currency)}
                  {" · "}creator impact{" "}
                  {money(
                    financialCase.host_impact_minor,
                    financialCase.currency,
                  )}
                </small>
                <p>{financialCase.opened_note}</p>
              </div>
              <div className="member-actions">
                {financialCase.case_type === "refund" ? (
                  <>
                    <button
                      disabled={busy === financialCase.case_id}
                      onClick={() => void reviewCase(financialCase, "complete")}
                    >
                      Mark processed
                    </button>
                    <button
                      disabled={busy === financialCase.case_id}
                      onClick={() => void reviewCase(financialCase, "reject")}
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      disabled={busy === financialCase.case_id}
                      onClick={() => void reviewCase(financialCase, "win")}
                    >
                      Won — release hold
                    </button>
                    <button
                      className="danger-action"
                      disabled={busy === financialCase.case_id}
                      onClick={() => void reviewCase(financialCase, "lose")}
                    >
                      Lost
                    </button>
                  </>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="admin-empty">
            <strong>No open financial cases</strong>
            <p>Signed provider events and manually opened cases appear here.</p>
          </div>
        )}
      </div>

      <div className="finance-settlement-queue">
        <div>
          <p className="eyebrow">Settlement ledger</p>
          <h3>Draft, approve, then record payment</h3>
        </div>
        {settlements.length ? (
          settlements.map((settlement) => (
            <article key={settlement.batch_id}>
              <div>
                <strong>{settlement.community_name}</strong>
                <span>
                  {settlement.reference} · {settlement.status}
                </span>
                <small>
                  {money(settlement.amount_minor, settlement.currency)} through{" "}
                  {new Date(settlement.period_ends_at).toLocaleDateString(
                    "en-KE",
                    { dateStyle: "medium" },
                  )}
                </small>
              </div>
              <div className="member-actions">
                {settlement.status === "draft" ? (
                  <>
                    <button
                      disabled={busy === settlement.batch_id}
                      onClick={() =>
                        void reviewSettlement(settlement, "approve")
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="danger-action"
                      disabled={busy === settlement.batch_id}
                      onClick={() =>
                        void reviewSettlement(settlement, "cancel")
                      }
                    >
                      Cancel
                    </button>
                  </>
                ) : settlement.status === "approved" ? (
                  <button
                    disabled={busy === settlement.batch_id}
                    onClick={() => void markPaid(settlement)}
                  >
                    Record provider payment
                  </button>
                ) : (
                  <span>{settlement.provider_settlement_reference}</span>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="admin-empty">
            <strong>No settlement batches yet</strong>
            <p>
              Build the first draft only after provider fees and open cases are
              reconciled.
            </p>
          </div>
        )}
      </div>

      {message ? (
        <p className="manager-message content-manager-message" role="status">
          {message}
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
