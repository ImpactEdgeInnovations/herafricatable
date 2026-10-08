"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { GuideListenButton } from "@/components/member/guide-listen-button";
import {
  GuideCopyButton,
  GuideFeedback,
  GuideResultCards,
} from "@/components/member/guide-result-cards";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";
import {
  clearGuideSession,
  loadGuideSession,
  saveGuideSession,
  type GuideCategory,
  type GuideMessage,
  type GuideSuggestion,
} from "@/lib/table-guide-session";

type Position = { x: number; y: number };

const STORAGE_KEY = "hat-table-guide-position-v1";
const HIDDEN_KEY = "hat-table-guide-hidden-date-v1";
const DOCK_SIZE = 64;
const EDGE_GAP = 16;

const routeHelp: Record<string, { prompts: string[]; title: string }> = {
  "/communities": {
    prompts: [
      "What can I do in this Community?",
      "Help me prepare for a gathering.",
      "Draft a warm Community post.",
    ],
    title: "Taking part in Community?",
  },
  "/events": {
    prompts: [
      "Which event might suit me?",
      "Draft an event invitation.",
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
      "Draft a respectful introduction.",
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
  "/referrals": {
    prompts: [
      "How do referrals work?",
      "Draft a personal invitation.",
      "What happens after someone joins?",
    ],
    title: "Growing the table thoughtfully?",
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

function defaultPosition(preferredX?: number): Position {
  const actions = window.innerWidth <= 620
    ? document.querySelector(".event-host-page .host-workspace-actions")
    : null;
  const actionTop = actions?.getBoundingClientRect().top;
  const defaultY = window.innerHeight - DOCK_SIZE - 104;
  const placed = clampPosition({
    x: preferredX ?? window.innerWidth - DOCK_SIZE - 24,
    y: actionTop !== undefined && actionTop > 0 && actionTop < window.innerHeight
      ? Math.min(defaultY, actionTop - DOCK_SIZE - EDGE_GAP)
      : defaultY,
  });
  if (!actions) return placed;
  const controls = Array.from(document.querySelectorAll(".event-host-page .host-workspace :is(button, a, select, summary)"))
    .map(element => element.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > placed.x && rect.left < placed.x + DOCK_SIZE);
  const candidates = [placed.y, ...controls.flatMap(rect => [rect.top - DOCK_SIZE - EDGE_GAP, rect.bottom + EDGE_GAP])]
    .filter(y => y >= EDGE_GAP && y <= placed.y)
    .sort((left, right) => Math.abs(left - placed.y) - Math.abs(right - placed.y));
  const clearY = candidates.find(y => controls.every(rect => y + DOCK_SIZE <= rect.top || y >= rect.bottom));
  return { ...placed, y: clearY ?? placed.y };
}

function quotaLabel(remaining: number) {
  return remaining <= 5
    ? `${remaining} question${remaining === 1 ? "" : "s"} left today`
    : "Available today";
}

export function FloatingTableGuide({
  assistantEnabled,
  featureEnabled,
  firstName,
  installed,
  remainingToday,
}: {
  assistantEnabled: boolean;
  featureEnabled: boolean;
  firstName: string;
  installed: boolean;
  remainingToday: number;
}) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const route = useMemo(
    () => pathname.match(/^\/events\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/|$)/)
      ? {
          prompts: [
            "What time and where is this event?",
            "What is on the published programme?",
            "How do I request a seat?",
          ],
          title: "Questions about this gathering?",
        }
      : Object.entries(routeHelp).find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? {
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
  const [sessionReady, setSessionReady] = useState(false);
  const [hiddenToday, setHiddenToday] = useState(false);
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
  const launcher = useRef<HTMLButtonElement>(null);
  const guidePanel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      guidePanel.current?.querySelector<HTMLElement>('input, button')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function closeGuide() {
    setOpen(false);
    launcher.current?.focus();
  }

  useEffect(() => {
    if (pathname === "/guide") return;
    const fallback = defaultPosition();
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      setPosition(
        window.innerWidth <= 620
          ? fallback
          : saved
            ? clampPosition(JSON.parse(saved) as Position)
            : fallback,
      );
      setHiddenToday(
        window.localStorage.getItem(HIDDEN_KEY) ===
          new Date().toISOString().slice(0, 10),
      );
    } catch {
      setPosition(fallback);
    }
    const hostWorkspace = document.querySelector(".event-host-page .host-workspace");
    const keepInView = () => setPosition((current) => {
      const next = current
        ? clampPosition(hostWorkspace && window.innerWidth <= 620
          ? { x: current.x, y: defaultPosition(current.x).y }
          : current)
        : defaultPosition();
      return current?.x === next.x && current?.y === next.y ? current : next;
    });
    const hostObserver = hostWorkspace ? new ResizeObserver(keepInView) : null;
    if (hostWorkspace) hostObserver?.observe(hostWorkspace);
    window.addEventListener("resize", keepInView);
    if (hostWorkspace) window.addEventListener("scroll", keepInView, { passive: true });
    return () => {
      hostObserver?.disconnect();
      window.removeEventListener("resize", keepInView);
      window.removeEventListener("scroll", keepInView);
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/guide") return;
    setMessages((current) => loadGuideSession(current));
    setSessionReady(true);
  }, [pathname]);

  useEffect(() => {
    if (sessionReady && pathname !== "/guide") saveGuideSession(messages);
  }, [messages, pathname, sessionReady]);

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
    if (window.innerWidth <= 620) return;
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
        body: JSON.stringify({
          eventSlug: pathname.match(/^\/events\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/)?.[1],
          history,
          message: clean,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        actions?: { href: string; label: string }[];
        answer?: string;
        category?: GuideCategory;
        error?: string;
        suggestions?: GuideSuggestion[];
      };
      if (response.ok) setRemaining((current) => Math.max(0, current - 1));
      setMessages((current) => [
        ...current,
        {
          category: result.category,
          content:
            result.answer ??
            result.error ??
            "I’m having a short pause. Try that question again, or ask our team for help.",
          role: "assistant",
          suggestions: result.suggestions,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          content: "I’m having a short pause. Please try again in a moment, or ask our team for help.",
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
    clearGuideSession();
    setMessages([
      {
        content: `Fresh start, ${firstName}. What would you like help with?`,
        role: "assistant",
      },
    ]);
    setQuestion("");
    setNotice("Cleared. Nia’s conversation is not kept as a permanent transcript.");
  }

  function placeGuide(side: "left" | "right") {
    if (!position) return;
    const next = clampPosition({
      x:
        side === "left"
          ? EDGE_GAP
          : window.innerWidth - DOCK_SIZE - EDGE_GAP,
      y: position.y,
    });
    if (window.innerWidth <= 620 && document.querySelector(".event-host-page .host-workspace-actions")) next.y = defaultPosition(next.x).y;
    setPosition(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function resetPosition() {
    const next = defaultPosition();
    setPosition(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function hideForToday() {
    window.localStorage.setItem(
      HIDDEN_KEY,
      new Date().toISOString().slice(0, 10),
    );
    setOpen(false);
    setHiddenToday(true);
  }

  function restoreGuide() {
    window.localStorage.removeItem(HIDDEN_KEY);
    setHiddenToday(false);
  }

  if (!position) return null;
  if (pathname === "/guide") return null;
  if (hiddenToday) {
    return (
      <button
        className="floating-guide-restore"
        onClick={restoreGuide}
        type="button"
      >
        Show Nia
      </button>
    );
  }

  const dockedLeft = position.x < window.innerWidth / 2;
  // The Guide has a safe local answer mode, so a temporary provider outage
  // should not hide the member-facing helper or force a redirect.
  const ready = installed && featureEnabled && enabled;
  const restingMessage = !installed
    ? "Your Table Guide is being prepared. It will open here when setup is complete."
    : !featureEnabled
      ? "The Table Guide is resting while Her Africa Table prepares it for members."
    : "Turn on the Guide here. It will open immediately without taking you to another page.";

  return (
    <aside
      className={`floating-table-guide${quiet ? " is-quiet" : ""}${open ? " is-open" : ""}`}
      data-side={dockedLeft ? "left" : "right"}
      data-vertical={position.y < 410 ? "below" : "above"}
      style={{ left: position.x, top: position.y }}
      onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); closeGuide(); } }}
    >
      {open ? (
        <section aria-label="Table Guide" className="floating-guide-panel" id="floating-table-guide-panel" ref={guidePanel}>
          <header>
            <div>
              <span>Nia · AI Table Guide</span>
              <strong>{route.title}</strong>
            </div>
            <button aria-label="Close Table Guide" onClick={closeGuide} type="button">×</button>
          </header>
          {ready ? (
            <>
              <div aria-busy={Boolean(busy)} aria-live="polite" className="floating-guide-messages">
                {messages.slice(-4).map((message, index) => (
                  <div className={message.role} key={`${message.role}-${index}`}>
                    <p>{message.content}</p>
                    {message.role === "assistant" ? (
                      <GuideResultCards compact suggestions={message.suggestions ?? []} />
                    ) : null}
                    {message.role === "assistant" && featureEnabled ? (
                      <div className="guide-response-tools">
                        <GuideListenButton compact text={message.content} />
                        <GuideCopyButton compact text={message.content} />
                      </div>
                    ) : null}
                    {message.role === "assistant" ? (
                      <GuideFeedback category={message.category} compact />
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
                <span>{quotaLabel(remaining)}</span>
                <button onClick={clearConversation} type="button">Clear conversation</button>
              </footer>
              {notice ? <p className="floating-guide-notice" role="status">{notice}</p> : null}
            </>
          ) : (
            <div className="floating-guide-welcome">
              <p>{restingMessage}</p>
              {installed && featureEnabled && !enabled ? (
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
          <div className="floating-guide-position-controls" aria-label="Nia display choices">
            <button onClick={() => setQuiet((current) => !current)} type="button">
              {quiet ? "Allow gentle movement" : "Keep still"}
            </button>
            <button onClick={() => placeGuide(dockedLeft ? "right" : "left")} type="button">Dock {dockedLeft ? "right" : "left"}</button>
            <button onClick={resetPosition} type="button">Reset position</button>
            <button onClick={hideForToday} type="button">Hide today</button>
          </div>
        </section>
      ) : null}
      <button
        aria-label="Open Nia, or drag to move her"
        aria-expanded={open}
        aria-controls={open ? "floating-table-guide-panel" : undefined}
        ref={launcher}
        className="floating-guide-character"
        onClick={event => { if (event.detail === 0) setOpen(current => !current); }}
        onPointerCancel={finishDrag}
        onPointerDown={beginDrag}
        onPointerMove={move}
        onPointerUp={finishDrag}
        title={featureEnabled ? "Ask Nia · drag to move" : "Nia is resting"}
        type="button"
      >
        <span className="floating-guide-spark" aria-hidden="true">H</span>
        <span className="floating-guide-monogram" aria-hidden="true">N</span>
        <span className="floating-guide-name" aria-hidden="true">Nia</span>
        <span className="floating-guide-shadow" aria-hidden="true" />
      </button>
    </aside>
  );
}
