"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { GuideListenButton } from "@/components/member/guide-listen-button";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";

type GuideMessage = {
  action?: { href: string; label: string };
  content: string;
  role: "assistant" | "user";
};

type Position = { x: number; y: number };

const STORAGE_KEY = "hat-table-guide-position-v1";
const DOCK_SIZE = 64;
const EDGE_GAP = 16;

const routeHelp: Record<string, { prompts: string[]; title: string }> = {
  "/communities": {
    prompts: [
      "Help me choose a Community.",
      "How does joining a private Community work?",
      "How can I start my own Community?",
    ],
    title: "Finding your people?",
  },
  "/events": {
    prompts: [
      "Which event might suit me?",
      "How do I propose an event?",
      "What happens after I request a seat?",
    ],
    title: "Planning to gather?",
  },
  "/home": {
    prompts: [
      "What should I do next?",
      "Show me what is coming up.",
      "Help me find my people.",
    ],
    title: "Where shall we begin?",
  },
  "/network": {
    prompts: [
      "Who could I thoughtfully connect with?",
      "How do introductions work?",
      "Help me find someone in my industry.",
    ],
    title: "Looking for an introduction?",
  },
  "/profile": {
    prompts: [
      "Help me improve my profile.",
      "What should I share in my bio?",
      "How do I control who can find me?",
    ],
    title: "Shaping your profile?",
  },
};

function clampPosition(position: Position): Position {
  const maxX = Math.max(EDGE_GAP, window.innerWidth - DOCK_SIZE - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, window.innerHeight - DOCK_SIZE - 84);
  return {
    x: Math.min(Math.max(position.x, EDGE_GAP), maxX),
    y: Math.min(Math.max(position.y, EDGE_GAP), maxY),
  };
}

export function FloatingTableGuide({
  assistantEnabled,
  featureEnabled,
  firstName,
  installed,
  keyConfigured,
  remainingToday,
}: {
  assistantEnabled: boolean;
  featureEnabled: boolean;
  firstName: string;
  installed: boolean;
  keyConfigured: boolean;
  remainingToday: number;
}) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const route = useMemo(
    () =>
      Object.entries(routeHelp).find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? {
        prompts: [
          "Help me find my way around.",
          "What can I do here?",
          "How can I get human help?",
        ],
        title: "Need a hand?",
      },
    [pathname],
  );
  const [position, setPosition] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [activating, setActivating] = useState(false);
  const [enabled, setEnabled] = useState(assistantEnabled);
  const [notice, setNotice] = useState("");
  const [remaining, setRemaining] = useState(remainingToday);
  const [messages, setMessages] = useState<GuideMessage[]>([
    {
      content: `Hello ${firstName}. I’m Nia, your Table Guide. I am here when you want a little help.`,
      role: "assistant",
    },
  ]);
  const drag = useRef<{
    moved: boolean;
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    const fallback = clampPosition({
      x: window.innerWidth - DOCK_SIZE - 24,
      y: window.innerHeight - DOCK_SIZE - 104,
    });
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      setPosition(saved ? clampPosition(JSON.parse(saved) as Position) : fallback);
    } catch {
      setPosition(fallback);
    }
    const keepInView = () =>
      setPosition((current) => (current ? clampPosition(current) : fallback));
    window.addEventListener("resize", keepInView);
    return () => window.removeEventListener("resize", keepInView);
  }, []);

  function beginDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!position) return;
    drag.current = {
      moved: false,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: position.x,
      startY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.pointerX;
    const dy = event.clientY - drag.current.pointerY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true;
    setPosition(clampPosition({ x: drag.current.startX + dx, y: drag.current.startY + dy }));
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !position) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const placed = clampPosition(position);
    const moved = drag.current.moved;
    drag.current = null;
    setPosition(placed);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placed));
    if (!moved) setOpen((current) => !current);
  }

  async function askGuide(value: string) {
    const clean = value.trim();
    if (!clean || busy || remaining < 1) return;
    const history = messages.slice(-4);
    setMessages((current) => [...current, { content: clean, role: "user" }]);
    setQuestion("");
    setBusy(true);
    try {
      const response = await fetch("/api/table-guide", {
        body: JSON.stringify({ history, message: clean }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        actions?: { href: string; label: string }[];
        answer?: string;
        error?: string;
      };
      if (response.ok) setRemaining((current) => Math.max(0, current - 1));
      setMessages((current) => [
        ...current,
        {
          action: result.actions?.[0],
          content:
            result.answer ??
            result.error ??
            "I could not answer just now. Please open Support if you need a person.",
          role: "assistant",
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          content: "I could not answer just now. Please try again shortly.",
          role: "assistant",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function turnOnGuide() {
    if (activating) return;
    setActivating(true);
    setNotice("");
    const { error } = await supabase.rpc("set_my_table_guide_preferences", {
      p_assistant_enabled: true,
      p_recommend_me: false,
    });
    setActivating(false);
    if (error) {
      setNotice(memberErrorMessage(error, "turn on your Table Guide"));
      return;
    }
    setEnabled(true);
    setMessages([
      {
        content: `I’m ready, ${firstName}. Choose a suggestion below or ask me anything about Her Africa Table.`,
        role: "assistant",
      },
    ]);
  }

  function clearConversation() {
    setMessages([
      {
        content: `Fresh start, ${firstName}. What would you like help with?`,
        role: "assistant",
      },
    ]);
    setQuestion("");
    setNotice("");
  }

  if (!position) return null;

  const dockedLeft = position.x < window.innerWidth / 2;
  const ready = installed && featureEnabled && enabled && keyConfigured;
  const restingMessage = !installed
    ? "Your Table Guide is being prepared. It will open here when setup is complete."
    : !featureEnabled
      ? "The Table Guide is resting while Her Africa Table prepares it for members."
      : !keyConfigured
        ? "The Guide’s secure connection is being prepared. You can still explore the platform normally."
        : "Turn on the Guide here. It will open immediately without taking you to another page.";

  return (
    <aside
      className={`floating-table-guide${quiet ? " is-quiet" : ""}${open ? " is-open" : ""}`}
      data-side={dockedLeft ? "left" : "right"}
      data-vertical={position.y < 410 ? "below" : "above"}
      style={{ left: position.x, top: position.y }}
    >
      {open ? (
        <section aria-label="Table Guide" className="floating-guide-panel">
          <header>
            <div>
              <span>Nia · AI Table Guide</span>
              <strong>{route.title}</strong>
            </div>
            <button aria-label="Close Table Guide" onClick={() => setOpen(false)} type="button">×</button>
          </header>
          {ready ? (
            <>
              <div aria-live="polite" className="floating-guide-messages">
                {messages.slice(-4).map((message, index) => (
                  <div className={message.role} key={`${message.role}-${index}`}>
                    <p>{message.content}</p>
                    {message.role === "assistant" && message.action ? (
                      <a className="floating-guide-action" href={message.action.href}>
                        {message.action.label} <span aria-hidden="true">→</span>
                      </a>
                    ) : null}
                    {message.role === "assistant" && featureEnabled ? (
                      <GuideListenButton compact text={message.content} />
                    ) : null}
                  </div>
                ))}
                {busy ? <div className="assistant"><p>Let me consider that…</p></div> : null}
              </div>
              <div className="floating-guide-suggestions" aria-label="Question ideas">
                {route.prompts.map((prompt) => (
                  <button
                    className="floating-guide-suggestion"
                    disabled={busy || remaining < 1}
                    key={prompt}
                    onClick={() => void askGuide(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); void askGuide(question); }}>
                <label className="sr-only" htmlFor="floating-guide-question">Ask the Table Guide</label>
                <input
                  id="floating-guide-question"
                  maxLength={1200}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask one question…"
                  value={question}
                />
                <button disabled={busy || !question.trim() || remaining < 1}>Ask</button>
              </form>
              <footer>
                <span>{remaining} questions left today</span>
                <button onClick={clearConversation} type="button">Clear conversation</button>
              </footer>
            </>
          ) : (
            <div className="floating-guide-welcome">
              <p>{restingMessage}</p>
              {installed && featureEnabled && keyConfigured && !enabled ? (
                <>
                  <ul>
                    <li>Ask questions without leaving this page</li>
                    <li>See suggestions for people, events and Communities</li>
                    <li>Private messages and contact details stay outside the Guide</li>
                  </ul>
                  <button
                    className="button button-primary"
                    disabled={activating}
                    onClick={() => void turnOnGuide()}
                    type="button"
                  >
                    {activating ? "Turning it on…" : "Turn on and start"}
                  </button>
                </>
              ) : null}
              {notice ? <small role="status">{notice}</small> : null}
            </div>
          )}
          <button className="floating-guide-quiet" onClick={() => setQuiet((current) => !current)} type="button">
            {quiet ? "Allow gentle movement" : "Keep the Guide still"}
          </button>
        </section>
      ) : null}
      <button
        aria-label="Open or move the Table Guide"
        className="floating-guide-character"
        onPointerCancel={finishDrag}
        onPointerDown={beginDrag}
        onPointerMove={move}
        onPointerUp={finishDrag}
        title={featureEnabled ? "Drag me, or tap for help" : "The Table Guide is resting"}
        type="button"
      >
        <span className="floating-guide-spark" aria-hidden="true">H</span>
        <span className="floating-guide-face" aria-hidden="true"><i /><i /><b /></span>
        <span className="floating-guide-shadow" aria-hidden="true" />
      </button>
    </aside>
  );
}
