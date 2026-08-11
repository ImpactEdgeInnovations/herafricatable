"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type TableGuideAccess = {
  assistant_enabled: boolean;
  feature_enabled: boolean;
  recommend_me: boolean;
  remaining_today: number;
  uses_today: number;
};

export type TableGuideConnection = {
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  common_goals: string[];
  common_interests: string[];
  company: string | null;
  country: string | null;
  display_name: string | null;
  industry: string | null;
  job_title: string | null;
  match_score: number;
  user_id: string;
};

type GuideMessage = {
  content: string;
  role: "assistant" | "user";
};

const quickQuestions = [
  "Help me get started",
  "Who could I connect with?",
  "What is coming up?",
];

function goalLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function TableGuide({
  access,
  connectionMode,
  connections,
  firstName,
  keyConfigured,
  profileStatus,
}: {
  access: TableGuideAccess | null;
  connectionMode: "curated_only" | "open" | "paused";
  connections: TableGuideConnection[];
  firstName: string;
  keyConfigured: boolean;
  profileStatus: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [remaining, setRemaining] = useState(access?.remaining_today ?? 0);
  const [messages, setMessages] = useState<GuideMessage[]>([
    {
      content: `Welcome, ${firstName}. I can help you find your way around the table, discover relevant people, understand Communities and prepare for upcoming events.`,
      role: "assistant",
    },
  ]);

  async function updatePreferences(
    assistantEnabled: boolean,
    recommendMe: boolean,
  ) {
    setBusy("preferences");
    setNotice("");
    const { error } = await supabase.rpc("set_my_table_guide_preferences", {
      p_assistant_enabled: assistantEnabled,
      p_recommend_me: recommendMe,
    });
    setBusy("");
    setNotice(
      error
        ? memberErrorMessage(error, "save your Table Guide choice")
        : assistantEnabled
          ? recommendMe
            ? "The Table Guide is ready, and your visible profile may be suggested to suitable members."
            : "The Table Guide is ready. Your profile will not be included in its recommendations."
          : "The Table Guide is off for your account.",
    );
    if (!error) router.refresh();
  }

  async function sendQuestion(value: string) {
    const clean = value.trim();
    if (clean.length < 2 || busy === "question") return;
    const prior = messages.slice(-6);
    setMessages((current) => [...current, { content: clean, role: "user" }]);
    setQuestion("");
    setBusy("question");
    setNotice("");
    try {
      const response = await fetch("/api/table-guide", {
        body: JSON.stringify({ history: prior, message: clean }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        answer?: string;
        error?: string;
        needsHuman?: boolean;
      };
      if (response.ok) setRemaining((current) => Math.max(0, current - 1));
      if (!response.ok || !result.answer) {
        setMessages((current) => [
          ...current,
          {
            content:
              result.error ??
              "I could not answer just now. Please try again or ask a person.",
            role: "assistant",
          },
        ]);
        return;
      }
      setMessages((current) => [
        ...current,
        { content: result.answer!, role: "assistant" },
      ]);
      if (result.needsHuman)
        setNotice("A person can help with this too. Use Ask a person when you are ready.");
    } catch {
      setMessages((current) => [
        ...current,
        {
          content: "I could not answer just now. Please try again or ask a person.",
          role: "assistant",
        },
      ]);
    } finally {
      setBusy("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await sendQuestion(question);
  }

  async function askPerson() {
    const latestQuestion = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.content;
    const confirmed = await ask({
      title: "Send this to a person?",
      description:
        "Your latest question will be added to a private support request. The support team will see it and reply through Her Africa Table.",
      confirmLabel: "Send to support",
    });
    if (!confirmed) return;
    setBusy("handoff");
    const { error } = await supabase.rpc("create_support_ticket", {
      p_category: "general",
      p_description:
        latestQuestion ?? "I would like help using the Her Africa Table platform.",
      p_subject: "Help requested from the Table Guide",
    });
    if (!error)
      await supabase.rpc("record_table_guide_usage", {
        p_category: "support",
        p_model: null,
        p_prompt_chars: latestQuestion?.length ?? 0,
        p_response_chars: 0,
        p_status: "handoff",
      });
    setBusy("");
    setNotice(
      error
        ? memberErrorMessage(error, "send your question to support")
        : "Your private support request has been sent. We will reply in Support.",
    );
  }

  if (!access) {
    return (
      <section className="table-guide-unavailable">
        <p className="eyebrow">Table Guide</p>
        <h1>The Guide is being prepared.</h1>
        <p>Apply the latest platform update, then return here.</p>
      </section>
    );
  }

  if (!access.feature_enabled || !keyConfigured) {
    return (
      <section className="table-guide-unavailable">
        <p className="eyebrow">A considered welcome</p>
        <h1>The Table Guide is nearly ready.</h1>
        <p>
          The private member concierge will open after the final Admin and safety
          checks. Your normal member experience remains available.
        </p>
        <Link className="button button-primary" href="/home">
          Return home
        </Link>
      </section>
    );
  }

  if (!access.assistant_enabled) {
    return (
      <section className="table-guide-consent">
        <div>
          <p className="eyebrow">Meet your Table Guide</p>
          <h1>A little help, when you want it.</h1>
          <p>
            The Guide can explain the platform, help shape your profile, surface
            relevant events and suggest people who have chosen to be discoverable.
          </p>
        </div>
        <div className="table-guide-boundaries">
          <article>
            <strong>Your private conversations stay private</strong>
            <p>The Guide cannot read member messages, safety cases or private contact details.</p>
          </article>
          <article>
            <strong>You remain in control</strong>
            <p>It may suggest or draft, but it cannot connect, publish, approve or pay for you.</p>
          </article>
          <article>
            <strong>Your questions are not kept as chat transcripts</strong>
            <p>Her Africa Table records limited usage totals, not the words you send or receive.</p>
          </article>
        </div>
        <button
          className="button button-primary"
          disabled={busy === "preferences"}
          onClick={() => void updatePreferences(true, false)}
        >
          {busy === "preferences" ? "Preparing…" : "Turn on my Table Guide"}
        </button>
        <small>You can turn it off at any time in Account &amp; privacy.</small>
        {notice ? <p role="status">{notice}</p> : null}
      </section>
    );
  }

  return (
    <div className="table-guide-shell">
      {dialog}
      <header className="table-guide-hero">
        <div>
          <p className="eyebrow">Your private member concierge</p>
          <h1>Good to see you, {firstName}.</h1>
          <p>Ask one question at a time. The Guide will keep the answer short and useful.</p>
        </div>
        <aside>
          <span>Today</span>
          <strong>{remaining}</strong>
          <small>questions remaining</small>
        </aside>
      </header>

      <div className="table-guide-layout">
        <section className="table-guide-chat" aria-labelledby="table-guide-chat-title">
          <h2 className="sr-only" id="table-guide-chat-title">Conversation with the Table Guide</h2>
          <div aria-live="polite" className="table-guide-messages">
            {messages.map((message, index) => (
              <article className={message.role} key={`${message.role}-${index}`}>
                <span>{message.role === "assistant" ? "Table Guide" : "You"}</span>
                <p>{message.content}</p>
              </article>
            ))}
            {busy === "question" ? (
              <article className="assistant table-guide-thinking">
                <span>Table Guide</span>
                <p>Let me consider that…</p>
              </article>
            ) : null}
          </div>
          <div className="table-guide-quick-questions">
            {quickQuestions.map((item) => (
              <button
                disabled={Boolean(busy) || remaining < 1}
                key={item}
                onClick={() => void sendQuestion(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          <form onSubmit={submit}>
            <label htmlFor="table-guide-question">What would you like help with?</label>
            <div>
              <textarea
                id="table-guide-question"
                maxLength={1200}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="For example: Who could I meet in finance or investment?"
                rows={3}
                value={question}
              />
              <button
                className="button button-primary"
                disabled={
                  busy === "question" || question.trim().length < 2 || remaining < 1
                }
              >
                Ask
              </button>
            </div>
          </form>
          <footer>
            <button
              className="button button-text"
              disabled={busy === "handoff"}
              onClick={() => void askPerson()}
              type="button"
            >
              {busy === "handoff" ? "Sending…" : "Ask a person instead"}
            </button>
            <span>The Guide can make mistakes. Confirm important details on the relevant page.</span>
          </footer>
          {notice ? <p className="network-message" role="status">{notice}</p> : null}
        </section>

        <aside className="table-guide-side">
          <section>
            <p className="eyebrow">Your choice</p>
            <h2>Be suggested to the right people</h2>
            <p>
              Only your visible member profile is considered. Private contact details and messages are never used.
            </p>
            {profileStatus !== "active" ? (
              <small>Complete onboarding before joining recommendations.</small>
            ) : connectionMode !== "open" ? (
              <small>
                Choose <Link href="/settings">Open to introductions</Link> before joining recommendations.
              </small>
            ) : (
              <button
                aria-pressed={access.recommend_me}
                className="table-guide-recommend-toggle"
                disabled={busy === "preferences"}
                onClick={() =>
                  void updatePreferences(true, !access.recommend_me)
                }
                type="button"
              >
                <span aria-hidden="true"><i /></span>
                <strong>{access.recommend_me ? "Included in suggestions" : "Not included in suggestions"}</strong>
              </button>
            )}
          </section>
          <nav aria-label="Useful member pages">
            <Link href="/network">Browse members <span>→</span></Link>
            <Link href="/communities">Open Communities <span>→</span></Link>
            <Link href="/events">See events <span>→</span></Link>
            <Link href="/support">Private support <span>→</span></Link>
          </nav>
        </aside>
      </div>

      {profileStatus === "active" ? (
        <section className="table-guide-connections" aria-labelledby="guide-connections-title">
          <header>
            <div>
              <p className="eyebrow">Introductions with context</p>
              <h2 id="guide-connections-title">People you may enjoy meeting</h2>
            </div>
            <p>
              These members are visible, open to introductions and have chosen to appear in suggestions.
            </p>
          </header>
          {connections.length ? (
            <div>
              {connections.map((member) => (
                <article key={member.user_id}>
                  <div className="table-guide-connection-heading">
                    {member.avatar_url ? (
                      <img alt="" src={member.avatar_url} />
                    ) : (
                      <span aria-hidden="true">{member.display_name?.slice(0, 1) ?? "H"}</span>
                    )}
                    <div>
                      <h3>{member.display_name ?? "Member"}</h3>
                      <p>{[member.job_title, member.company].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <small>{[member.industry, member.city].filter(Boolean).join(" · ")}</small>
                  {member.common_interests.length ? (
                    <p>Shared interests: {member.common_interests.slice(0, 3).join(", ")}</p>
                  ) : null}
                  {member.common_goals.length ? (
                    <p>Shared goals: {member.common_goals.slice(0, 2).map(goalLabel).join(", ")}</p>
                  ) : null}
                  <Link className="button button-outline" href={`/members/${member.user_id}`}>
                    View profile
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="table-guide-empty">
              <strong>Your suggestions will grow with the table.</strong>
              <p>
                Members appear here only after choosing to be visible, open to introductions and included in recommendations.
              </p>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
