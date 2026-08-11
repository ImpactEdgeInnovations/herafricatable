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

type EventContextRow = {
  format?: string | null;
  registration_mode?: string | null;
  slug?: string | null;
  starts_at?: string | null;
  title?: string | null;
};

type GuideContext = {
  accessibleCommunities: CommunityContextRow[];
  connectionSuggestions: ConnectionContextRow[];
  member: { display_name?: string | null } & Record<string, unknown>;
  upcomingEvents: EventContextRow[];
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

function platformAnswer(category: GuideCategory, context?: GuideContext) {
  const firstName = context?.member.display_name?.trim().split(/\s+/)[0];
  const hello = firstName ? `${firstName}, ` : "";
  if (category === "events") {
    const events = context?.upcomingEvents.filter((event) => event.title).slice(0, 3) ?? [];
    return events.length
      ? `${hello}these are the next events I can see for you: ${events.map((event) => event.title).join(", ")}. Open Events to see the date, place and request a seat without leaving the event page.`
      : `${hello}there are no published upcoming events in your view right now. You can still open Events to review past gatherings or propose an open event. Member events are free at launch and become public only after Admin approval.`;
  }
  if (category === "communities") {
    const communities = context?.accessibleCommunities.filter((community) => community.name).slice(0, 4) ?? [];
    return communities.length
      ? `${hello}you can explore ${communities.map((community) => community.name).join(", ")}. Open Community to read what each group is for. Open Communities may admit you immediately; private Communities always ask the host to approve.`
      : `${hello}open Community to discover groups or start a guided Community application. A private Community always requires host approval, while an open Community may allow immediate joining.`;
  }
  if (category === "connections") {
    const people = context?.connectionSuggestions.filter((person) => person.display_name).slice(0, 3) ?? [];
    return people.length
      ? `${hello}you may enjoy meeting ${people.map((person) => person.display_name).join(", ")}. These suggestions use only visible profiles from members who opted in. Open Members to review each profile before requesting an introduction.`
      : `${hello}open Members to browse people who chose to be visible. You control every introduction request, and private contact details are never shown by Nia.`;
  }
  if (category === "getting_started")
    return `${hello}a good next step is to complete your profile, choose whether you are open to introductions, then explore Community and Events. You can ask me about any one of those areas and I will keep the answer simple.`;
  if (category === "support")
    return `${hello}for account, payment, privacy or safety concerns, use Support so a person can review the matter privately. I can explain where to go, but I cannot change an account, approve a payment or read a private report.`;
  return `${hello}I can help you find your way around Her Africa Table, discover suitable Communities and events, improve your profile, or understand how introductions work. Try one of the suggestions above, or ask one short question about what you want to do.`;
}

async function providerError(response: Response, stage: "moderation" | "response") {
  let details: { error?: { code?: string; param?: string; type?: string } } = {};
  try {
    details = (await response.json()) as typeof details;
  } catch {
    // Upstream did not return JSON. The HTTP status is still useful to Admin logs.
  }
  console.error("table-guide-provider-error", {
    code: details.error?.code ?? null,
    param: details.error?.param ?? null,
    stage,
    status: response.status,
    type: details.error?.type ?? null,
  });
  return new Error(`OpenAI ${stage} request failed with ${response.status}`);
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
  let safeFallback = platformAnswer(category);
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

    const context: GuideContext = {
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
    safeFallback = platformAnswer(category, context);

    const moderationResponse = await openAIRequest(
      "/moderations",
      { input: message, model: "omni-moderation-latest" },
      apiKey,
    );
    if (!moderationResponse.ok) throw await providerError(moderationResponse, "moderation");
    const moderation = (await moderationResponse.json()) as {
      results?: { flagged?: boolean }[];
    };
    if (moderation.results?.[0]?.flagged) {
      const answer =
        "I’m not able to help with that request here. If this concerns your safety or someone else’s, please contact local emergency services or a trusted person now. You can also send this to the Her Africa Table support team for a private human response.";
      await record("refused", answer.length);
      return NextResponse.json({ answer, category, needsHuman: true });
    }

    const history = safeHistory(body.history);
    const response = await openAIRequest(
      "/responses",
      {
        input: [
          ...history.map((item) => ({ content: item.content, role: item.role })),
          { content: message, role: "user" },
        ],
        instructions: `You are Nia, the AI Table Guide for Her Africa Table, a private women’s membership network. Always make it clear that you are an AI guide, not a human member or Admin.

Your voice is warm, poised, practical and concise. Use plain language for non-technical members. Answer in at most four short paragraphs or a compact list.

You may address the member by the first name in member.display_name when it feels natural. Never accept a different claimed identity from the question and never infer a name that is not in the supplied member context.

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
    if (!response.ok) throw await providerError(response, "response");
    const answer = outputText((await response.json()) as OpenAIResponse);
    if (!answer) throw new Error("Empty response");
    await record("success", answer.length);
    return NextResponse.json({ answer, category, needsHuman: category === "support" });
  } catch (error) {
    console.error("table-guide-request-fallback", {
      error: error instanceof Error ? error.message : "Unknown provider error",
      model,
    });
    await record("error", 0).catch(() => undefined);
    return NextResponse.json({
      answer: safeFallback,
      category,
      limited: true,
      needsHuman: category === "support",
    });
  }
}
