export type GuideCategory =
  | "communities"
  | "connections"
  | "events"
  | "getting_started"
  | "referrals"
  | "other"
  | "support";

export type GuideSuggestion = {
  description: string;
  href: string;
  id: string;
  kind: "community" | "event" | "member" | "page";
  meta?: string;
  title: string;
};

export type GuideMessage = {
  category?: GuideCategory;
  content: string;
  role: "assistant" | "user";
  suggestions?: GuideSuggestion[];
};

export const TABLE_GUIDE_SESSION_KEY = "hat-nia-conversation-v2";

function validSuggestion(value: unknown): value is GuideSuggestion {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GuideSuggestion>;
  return Boolean(
    typeof item.description === "string" &&
      typeof item.href === "string" &&
      item.href.startsWith("/") &&
      typeof item.id === "string" &&
      ["community", "event", "member", "page"].includes(item.kind ?? "") &&
      typeof item.title === "string",
  );
}

function validMessage(value: unknown): value is GuideMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<GuideMessage>;
  return Boolean(
    (message.role === "assistant" || message.role === "user") &&
      typeof message.content === "string" &&
      message.content.length <= 5000 &&
      (!message.suggestions ||
        (Array.isArray(message.suggestions) &&
          message.suggestions.every(validSuggestion))),
  );
}

export function loadGuideSession(fallback: GuideMessage[]) {
  try {
    const saved = window.sessionStorage.getItem(TABLE_GUIDE_SESSION_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const messages = parsed.filter(validMessage).slice(-12);
    return messages.length ? messages : fallback;
  } catch {
    return fallback;
  }
}

export function saveGuideSession(messages: GuideMessage[]) {
  try {
    window.sessionStorage.setItem(
      TABLE_GUIDE_SESSION_KEY,
      JSON.stringify(messages.slice(-12)),
    );
  } catch {
    // The Guide remains usable when browser storage is unavailable.
  }
}

export function clearGuideSession() {
  try {
    window.sessionStorage.removeItem(TABLE_GUIDE_SESSION_KEY);
  } catch {
    // The current component state is still cleared below.
  }
}

export function dismissGuideSuggestion(kind: GuideSuggestion["kind"], id: string) {
  try {
    const saved = window.sessionStorage.getItem(TABLE_GUIDE_SESSION_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) return;
    const messages = parsed.filter(validMessage).map((message) => ({
      ...message,
      suggestions: message.suggestions?.filter(
        (suggestion) => suggestion.kind !== kind || suggestion.id !== id,
      ),
    }));
    saveGuideSession(messages);
  } catch {
    // The current card still disappears even if browser storage is unavailable.
  }
}
