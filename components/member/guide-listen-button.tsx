"use client";

import { useEffect, useRef, useState } from "react";

export function GuideListenButton({
  compact = false,
  text,
}: {
  compact?: boolean;
  text: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [notice, setNotice] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  async function listen() {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    if (state === "loading") return;

    setState("loading");
    setNotice("");
    try {
      const response = await fetch("/api/table-guide/speech", {
        body: JSON.stringify({ text }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setNotice(result.error ?? "Voice playback is unavailable right now.");
        setState("idle");
        return;
      }
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(await response.blob());
      const player = new Audio(objectUrl.current);
      audio.current = player;
      player.onended = () => setState("idle");
      player.onerror = () => {
        setNotice("This answer could not be played.");
        setState("idle");
      };
      await player.play();
      setState("playing");
    } catch {
      setNotice("Voice playback is unavailable right now.");
      setState("idle");
    }
  }

  return (
    <span className={`guide-listen${compact ? " is-compact" : ""}`}>
      <button
        aria-label={state === "playing" ? "Stop voice playback" : "Listen to this answer"}
        aria-pressed={state === "playing"}
        disabled={state === "loading"}
        onClick={() => void listen()}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          {state === "playing" ? (
            <><path d="M7 7h10v10H7z" /></>
          ) : (
            <><path d="M5 10v4h4l5 4V6l-5 4H5Z" /><path d="M17 9c1.5 1.5 1.5 4.5 0 6" /></>
          )}
        </svg>
        <span>{state === "loading" ? "Preparing…" : state === "playing" ? "Stop" : "Listen"}</span>
      </button>
      {notice ? <small role="status">{notice}</small> : null}
    </span>
  );
}
