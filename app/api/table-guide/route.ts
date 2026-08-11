import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GuideCategory =
  | "getting_started"
  | "connections"
  | "communities"
  | "events"
  | "support"
  | "other";

type GuideHistoryItem = {
  content: string;
  role: "assistant" | "user";
};

type GuideAccess = {
  assistant_enabled: boolean;
  feature_enabled: boolean;
  remaining_today: number;
};

type OpenAIResponse = {
  output?: { content?: { text?: string; type?: string }[] }[];
  output_text?: string;
};

type CommunityContextRow = {
  community_type?: string | null;
  description?: string | null;
  membership_status?: string | null;
  name?: string | null;
  slug?: string | null;
};

type ConnectionContextRow = {
  city?: string | null;
  common_goals?: string[] | null;
  common_interests?: string[] | null;
  company?: string | null;
  display_name?: string | null;
  industry?: string | null;
  job_title?: string | null;
  match_score?: number | null;
};

const OPENAI_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.6-luna";

function categoryFor(message: string): GuideCategory {
  const value = message.toLowerCase();
  if (/connect|introduc|member|meet|network|industry|mentor|collaborat/.test(value))
    return "connections";
  if (/communit|group|host|conversation|post/.test(value)) return "communities";
  if (/event|ticket|register|venue|nairobi|calendar|check.?in/.test(value))
    return "events";
  if (/help|support|problem|report|safe|privacy|payment|refund/.test(value))
    return "support";
  if (/start|join|profile|onboard|account|where|how do i/.test(value))
    return "getting_started";
  return "other";
}

function outputText(response: OpenAIResponse) {
  if (typeof response.output_text === "string") return response.output_text.trim();
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text!.trim())
    .filter(Boolean)
    .join("\n\n");
}

function safeHistory(value: unknown): GuideHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-6)
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const role = "role" in item ? item.role : null;
      const content = "content" in item ? item.content : null;
      if (
        (role !== "assistant" && role !== "user") ||
        typeof content !== "string" ||
        !content.trim()
      )
        return [];
      return [{ role, content: content.trim().slice(0, 1500) }];
    });
}

function safetyIdentifier(userId: string, salt: string) {
  return createHmac("sha256", salt)
    .update(userId)
    .digest("hex");
}

async function openAIRequest(path: string, body: object, apiKey: string) {
  return fetch(`${OPENAI_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(20_000),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });

  let body: { history?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter a question for the Table Guide" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 2 || message.length > 1200)
    return NextResponse.json(
      { error: "Keep your question between 2 and 1,200 characters" },
      { status: 400 },
    );

  const apiKey = process.env.OPENAI_API_KEY;
  const safetySalt = process.env.AI_SAFETY_SALT;
  if (!apiKey || !safetySalt)
    return NextResponse.json(
      { error: "The Table Guide is being prepared. Please try again later." },
      { status: 503 },
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });

  const { data: accessRows, error: accessError } = await supabase.rpc(
    "get_my_table_guide_access",
  );
  const access = (accessRows as GuideAccess[] | null)?.[0] ?? null;
  if (accessError || !access)
    return NextResponse.json(
      { error: "The Table Guide is not available for this account yet" },
      { status: 403 },
    );
  if (!access.feature_enabled)
    return NextResponse.json(
      { error: "The Table Guide is not open yet" },
      { status: 503 },
    );
  if (!access.assistant_enabled)
    return NextResponse.json(
      { error: "Turn on the Table Guide before asking a question" },
      { status: 403 },
    );
  if (Number(access.remaining_today) < 1)
    return NextResponse.json(
      { error: "You have reached today’s Table Guide limit. A person can still help you." },
      { status: 429 },
    );

  const category = categoryFor(message);
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const record = async (
    status: "error" | "refused" | "success",
    responseChars: number,
  ) => {
    await supabase.rpc("record_table_guide_usage", {
      p_category: category,
      p_model: model,
      p_prompt_chars: message.length,
      p_response_chars: responseChars,
      p_status: status,
    });
  };

  try {
    const moderationResponse = await openAIRequest(
      "/moderations",
      { input: message, model: "omni-moderation-latest" },
      apiKey,
    );
    if (!moderationResponse.ok) throw new Error("Moderation unavailable");
    const moderation = (await moderationResponse.json()) as {
      results?: { flagged?: boolean }[];
    };
    if (moderation.results?.[0]?.flagged) {
      const answer =
        "I’m not able to help with that request here. If this concerns your safety or someone else’s, please contact local emergency services or a trusted person now. You can also send this to the Her Africa Table support team for a private human response.";
      await record("refused", answer.length);
      return NextResponse.json({ answer, category, needsHuman: true });
    }

    const [profileResult, interestsResult, goalsResult, eventResult, communityResult, connectionResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name,job_title,industry,country,city,access_status,profile_completion")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("profile_interests").select("interest").eq("user_id", user.id),
        supabase.from("member_goals").select("goal_key").eq("user_id", user.id),
        supabase
          .from("events")
          .select("title,slug,format,starts_at,registration_mode")
          .eq("status", "published")
          .gte("starts_at", new Date().toISOString())
          .order("starts_at")
          .limit(3),
        supabase.rpc("list_communities"),
        category === "connections"
          ? supabase.rpc("list_table_guide_connections", { p_limit: 6 })
          : Promise.resolve({ data: [], error: null }),
      ]);

    const context = {
      accessibleCommunities: (communityResult.data ?? []).slice(0, 8).map((item: CommunityContextRow) => ({
        community_type: item.community_type,
        description: item.description,
        membership_status: item.membership_status,
        name: item.name,
        slug: item.slug,
      })),
      connectionSuggestions: (connectionResult.data ?? []).map((item: ConnectionContextRow) => ({
        city: item.city,
        common_goals: item.common_goals,
        common_interests: item.common_interests,
        company: item.company,
        display_name: item.display_name,
        industry: item.industry,
        job_title: item.job_title,
        match_score: item.match_score,
      })),
      member: {
        ...profileResult.data,
        goals: (goalsResult.data ?? []).map((item) => item.goal_key),
        interests: (interestsResult.data ?? []).map((item) => item.interest),
      },
      upcomingEvents: eventResult.data ?? [],
    };

    const history = safeHistory(body.history);
    const response = await openAIRequest(
      "/responses",
      {
        input: [
          ...history.map((item) => ({ content: item.content, role: item.role })),
          { content: message, role: "user" },
        ],
        instructions: `You are the Table Guide for Her Africa Table, a private women’s membership network.

Your voice is warm, poised, practical and concise. Use plain language for non-technical members. Answer in at most four short paragraphs or a compact list.

You may help with onboarding, profiles, platform navigation, upcoming events, accessible Communities, respectful introductions and support. The supplied JSON is authoritative and already filtered to what this member may see. Never invent an event, Community, member, approval, payment status or platform capability. For connection suggestions, mention only people in connectionSuggestions and explain the shared industry, location, interests or goals shown there. Make clear that suggestions are optional and the member must open the profile and choose whether to request an introduction.

Never reveal or infer private contact details, private messages, safety reports, Admin information, hidden profiles or other members’ sensitive data. Never claim to approve membership, send messages, request connections, publish content, take payments, issue refunds or change an account. Do not provide medical, legal or financial decisions. Offer the private human support route for account, payment, privacy, safety or unresolved matters.

Useful routes: Home /home; profile /profile; account and privacy /settings; members /network; Communities /communities; events /events; messages /messages; support /support.

Member-safe context:
${JSON.stringify(context)}`,
        max_output_tokens: 700,
        model,
        reasoning: { effort: "low" },
        safety_identifier: safetyIdentifier(user.id, safetySalt),
        store: false,
        text: { verbosity: "low" },
      },
      apiKey,
    );
    if (!response.ok) throw new Error("Response unavailable");
    const answer = outputText((await response.json()) as OpenAIResponse);
    if (!answer) throw new Error("Empty response");
    await record("success", answer.length);
    return NextResponse.json({ answer, category, needsHuman: category === "support" });
  } catch {
    await record("error", 0).catch(() => undefined);
    return NextResponse.json(
      { error: "The Table Guide could not answer just now. Please try again or ask a person." },
      { status: 502 },
    );
  }
}
