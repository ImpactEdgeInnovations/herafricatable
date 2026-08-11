import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const OPENAI_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.6-luna";
const COOLDOWN_SECONDS = 30;

function providerMessage(status: number, code?: string) {
  if (status === 401) return "OpenAI rejected the project key. Replace OPENAI_API_KEY in Vercel and redeploy.";
  if (status === 403) return "This OpenAI project does not have access to the selected model.";
  if (status === 429) return "The OpenAI project has reached a rate or billing limit. Check billing and usage in the OpenAI dashboard.";
  if (status === 400) return `OpenAI rejected the request configuration${code ? ` (${code})` : ""}.`;
  return `OpenAI returned service status ${status}. Try the test again shortly.`;
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role)
    return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });

  const apiKey = process.env.OPENAI_API_KEY;
  const safetySalt = process.env.AI_SAFETY_SALT;
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  if (!apiKey || !safetySalt)
    return NextResponse.json(
      { error: "OPENAI_API_KEY or AI_SAFETY_SALT is missing from this deployment." },
      { status: 503 },
    );

  const admin = createAdminClient();
  const since = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();
  const { count } = await admin
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", user.id)
    .in("action", ["table_guide.connection_test", "table_guide.connection_test_failed"])
    .gte("created_at", since);
  if ((count ?? 0) > 0)
    return NextResponse.json(
      { error: "Please wait 30 seconds before testing again." },
      { status: 429 },
    );

  try {
    const response = await fetch(`${OPENAI_URL}/responses`, {
      body: JSON.stringify({
        input: "Reply with the single word READY.",
        max_output_tokens: 32,
        model,
        reasoning: { effort: "none" },
        store: false,
        text: { verbosity: "low" },
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      let details: { error?: { code?: string; type?: string } } = {};
      try {
        details = (await response.json()) as typeof details;
      } catch {
        // The status remains enough for a safe Admin-facing diagnosis.
      }
      await admin.from("audit_events").insert({
        action: "table_guide.connection_test_failed",
        actor_id: user.id,
        metadata: {
          code: details.error?.code ?? null,
          model,
          status: response.status,
          type: details.error?.type ?? null,
        },
        target_type: "table_guide",
      });
      return NextResponse.json(
        { error: providerMessage(response.status, details.error?.code) },
        { status: 503 },
      );
    }

    await admin.from("audit_events").insert({
      action: "table_guide.connection_test",
      actor_id: user.id,
      metadata: { model, status: response.status },
      target_type: "table_guide",
    });
    return NextResponse.json({ model, ready: true });
  } catch {
    await admin.from("audit_events").insert({
      action: "table_guide.connection_test_failed",
      actor_id: user.id,
      metadata: { model, status: "network_or_timeout" },
      target_type: "table_guide",
    });
    return NextResponse.json(
      { error: "The deployment could not reach OpenAI. Try again shortly." },
      { status: 503 },
    );
  }
}
