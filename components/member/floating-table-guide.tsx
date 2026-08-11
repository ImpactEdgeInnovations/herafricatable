"use client";

import Link from "next/link";
import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type GuideMessage = {
  content: string;
  role: "assistant" | "user";
};

type Position = { x: number; y: number };

const STORAGE_KEY = "hat-table-guide-position-v1";
const DOCK_SIZE = 64;
const EDGE_GAP = 16;

const routeHelp: Record<string, { prompt: string; title: string }> = {
  "/communities": {
    prompt: "Help me choose a Community and understand how joining works.",
    title: "Finding your people?",
  },
  "/events": {
    prompt: "Help me understand upcoming events and how I can propose one.",
    title: "Planning to gather?",
  },
  "/home": {
    prompt: "What is the most useful thing for me to do next?",
    title: "Where shall we begin?",
  },
  "/network": {
    prompt: "Who could I thoughtfully connect with and why?",
    title: "Looking for an introduction?",
  },
  "/profile": {
    prompt: "Help me make my profile clearer and more welcoming.",
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
  firstName,
  keyConfigured,
  remainingToday,
}: {
  assistantEnabled: boolean;
  firstName: string;
  keyConfigured: boolean;
  remainingToday: number;
}) {
  const pathname = usePathname();
  const route = useMemo(
    () =>
      Object.entries(routeHelp).find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? {
        prompt: "Help me find my way around Her Africa Table.",
        title: "Need a hand?",
      },
    [pathname],
  );
  const [position, setPosition] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(remainingToday);
  const [messages, setMessages] = useState<GuideMessage[]>([
    {
      content: `Hello ${firstName}. I am here when you want a little help.`,
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
    const snapped = clampPosition({
      x:
        position.x + DOCK_SIZE / 2 < window.innerWidth / 2
          ? EDGE_GAP
          : window.innerWidth - DOCK_SIZE - EDGE_GAP,
      y: position.y,
    });
    const moved = drag.current.moved;
    drag.current = null;
    setPosition(snapped);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
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
      const result = (await response.json()) as { answer?: string; error?: string };
      if (response.ok) setRemaining((current) => Math.max(0, current - 1));
      setMessages((current) => [
        ...current,
        {
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

  if (!position) return null;

  const dockedLeft = position.x < window.innerWidth / 2;
  const ready = assistantEnabled && keyConfigured;

  return (
    <aside
      className={`floating-table-guide${quiet ? " is-quiet" : ""}${open ? " is-open" : ""}`}
      data-side={dockedLeft ? "left" : "right"}
      style={{ left: position.x, top: position.y }}
    >
      {open ? (
        <section aria-label="Table Guide" className="floating-guide-panel">
          <header>
            <div>
              <span>Table Guide</span>
              <strong>{route.title}</strong>
            </div>
            <button aria-label="Close Table Guide" onClick={() => setOpen(false)} type="button">×</button>
          </header>
          {ready ? (
            <>
              <div aria-live="polite" className="floating-guide-messages">
                {messages.slice(-4).map((message, index) => (
                  <p className={message.role} key={`${message.role}-${index}`}>{message.content}</p>
                ))}
                {busy ? <p className="assistant">Let me consider that…</p> : null}
              </div>
              <button
                className="floating-guide-suggestion"
                disabled={busy || remaining < 1}
                onClick={() => void askGuide(route.prompt)}
                type="button"
              >
                {route.prompt}
              </button>
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
                <Link href="/guide">Open full Guide</Link>
              </footer>
            </>
          ) : (
            <div className="floating-guide-welcome">
              <p>The Guide is optional. Turn it on when you would like help finding people, events or Communities.</p>
              <Link className="button button-primary" href="/guide">Meet the Table Guide</Link>
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
        title="Drag me, or tap for help"
        type="button"
      >
        <span className="floating-guide-spark" aria-hidden="true">✦</span>
        <span className="floating-guide-face" aria-hidden="true"><i /><i /><b /></span>
        <span className="floating-guide-shadow" aria-hidden="true" />
      </button>
    </aside>
  );
}
