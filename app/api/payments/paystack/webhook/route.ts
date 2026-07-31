import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerPaymentEnv } from "@/lib/env";

type PaystackWebhookData = {
  amount?: number | string;
  currency?: string;
  id?: number | string;
  reference?: string;
  refund_amount?: number | string;
  refund_reference?: string | null;
  resolution?: string;
  status?: string;
  transaction?: {
    amount?: number | string;
    currency?: string;
    reference?: string;
  };
  transaction_reference?: string;
};

type PaystackWebhook = {
  event?: string;
  data?: PaystackWebhookData;
};

const financialEvents = new Set([
  "refund.pending",
  "refund.processing",
  "refund.needs-attention",
  "refund.failed",
  "refund.processed",
  "charge.dispute.create",
  "charge.dispute.remind",
  "charge.dispute.resolve",
]);

function positiveMinor(value: number | string | undefined) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  let secret: string;
  try {
    secret = getServerPaymentEnv().paystackSecretKey;
  } catch {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const valid =
    /^[a-f0-9]{128}$/i.test(signature) &&
    timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    );
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PaystackWebhook;
  try {
    payload = JSON.parse(raw) as PaystackWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = payload.event ?? "";
  const data = payload.data;
  if (!data) {
    return NextResponse.json({ error: "Incomplete event" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (event === "charge.success") {
    const amount = positiveMinor(data.amount);
    if (!data.reference || !amount || !data.currency) {
      return NextResponse.json({ error: "Incomplete event" }, { status: 400 });
    }
    const { error } = await admin.rpc("process_paystack_payment", {
      p_amount_minor: amount,
      p_currency: data.currency,
      p_event_type: event,
      p_payload: payload,
      p_provider_event_id: `${event}:${data.id ?? data.reference}`,
      p_reference: data.reference,
      p_signature_verified: true,
      p_status: data.status ?? "success",
    });
    if (error) {
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  if (!financialEvents.has(event)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const transactionReference =
    data.transaction_reference ??
    data.transaction?.reference ??
    data.reference;
  const amount = positiveMinor(
    data.amount ?? data.refund_amount ?? data.transaction?.amount,
  );
  const currency = data.currency ?? data.transaction?.currency;
  if (!transactionReference || !amount || !currency) {
    return NextResponse.json(
      { error: "Incomplete financial event" },
      { status: 400 },
    );
  }

  const providerCaseReference = String(
    data.refund_reference ??
      data.id ??
      `${transactionReference}:${amount}`,
  );
  const providerEventId = `${event}:${
    data.id ??
    data.refund_reference ??
    `${transactionReference}:${amount}:${data.status ?? "unknown"}`
  }`;
  const { error } = await admin.rpc("process_community_financial_webhook", {
    p_amount_minor: amount,
    p_currency: currency,
    p_event_type: event,
    p_payload: payload,
    p_provider_case_reference: providerCaseReference,
    p_provider_event_id: providerEventId,
    p_signature_verified: true,
    p_status: data.resolution ?? data.status ?? event.split(".").at(-1),
    p_transaction_reference: transactionReference,
  });
  if (error) {
    return NextResponse.json(
      { error: "Financial reconciliation failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ received: true });
}
