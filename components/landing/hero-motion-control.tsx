"use client";

import { useState } from "react";

export function HeroMotionControl({ className }: { className: string }) {
  const [paused, setPaused] = useState(false);
  return <button type="button" className={className} aria-pressed={paused}
    aria-label={paused ? "Play floating card animation" : "Pause floating card animation"}
    onClick={() => setPaused(value => !value)}>
    <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>
    {paused ? "Play motion" : "Pause motion"}
  </button>;
}
