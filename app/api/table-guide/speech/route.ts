import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OPENAI_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "coral";

type SpeechAccess = {
  allowed: boolean;
  remaining_today: number;
};

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Choose an answer to listen to" }, { status: 400 });
  }

  const input = typeof body.text === "string" ? body.text.trim() : "";
  if (input.length < 2 || input.length > 1600)
    return NextResponse.json(
      { error: "Voice playback supports answers up to 1,600 characters" },
      { status: 400 },
    );

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { error: "Voice playback is being prepared" },
      { status: 503 },
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Please sign in again" }, { status: 401 });

  const { data: accessRows, error: accessError } = await supabase.rpc(
    "get_my_table_guide_speech_access",
  );
  const access = (accessRows as SpeechAccess[] | null)?.[0] ?? null;
  if (accessError || !access)
    return NextResponse.json(
      { error: "Voice playback needs the latest platform update" },
      { status: 503 },
    );
  if (!access.allowed)
    return NextResponse.json(
      { error: "Voice playback is not available for this account right now" },
      { status: Number(access.remaining_today) < 1 ? 429 : 403 },
    );

  const model = process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_MODEL;
  const voice = process.env.OPENAI_TTS_VOICE?.trim() || DEFAULT_VOICE;
  const record = async (status: "error" | "refused" | "success") => {
    await supabase.rpc("record_table_guide_speech_usage", {
      p_input_chars: input.length,
      p_model: model,
      p_status: status,
    });
  };

  try {
    const moderationResponse = await fetch(`${OPENAI_URL}/moderations`, {
      body: JSON.stringify({ input, model: "omni-moderation-latest" }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!moderationResponse.ok) throw new Error("Moderation unavailable");
    const moderation = (await moderationResponse.json()) as {
      results?: { flagged?: boolean }[];
    };
    if (moderation.results?.[0]?.flagged) {
      await record("refused");
      return NextResponse.json(
        { error: "This answer cannot be played aloud" },
        { status: 400 },
      );
    }

    const speechResponse = await fetch(`${OPENAI_URL}/audio/speech`, {
      body: JSON.stringify({
        input,
        instructions:
          "Speak warmly, calmly and clearly. Keep a poised, conversational pace suitable for an inclusive member concierge.",
        model,
        response_format: "mp3",
        voice,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    if (!speechResponse.ok) throw new Error("Speech unavailable");
    const audio = await speechResponse.arrayBuffer();
    await record("success");
    return new NextResponse(audio, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "audio/mpeg",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    await record("error").catch(() => undefined);
    return NextResponse.json(
      { error: "The Guide could not speak just now. Please try again shortly." },
      { status: 502 },
    );
  }
}
