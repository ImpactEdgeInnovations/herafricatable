"use client";
import { useMemo, useState } from "react";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";
export function LessonProgressControl({
  lessonId,
  complete,
}: {
  lessonId: string;
  complete: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [done, setDone] = useState(complete);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function mark() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("save_lesson_progress", {
      p_lesson_id: lessonId,
      p_position: null,
      p_progress: 100,
    });
    setBusy(false);
    if (error) {
      setMessage(memberErrorMessage(error, "mark this lesson complete"));
      return;
    }
    setDone(true);
    setMessage("Lesson marked complete.");
  }
  return (
    <div className="lesson-progress-control">
      <button
        className={done ? "lesson-complete" : ""}
        disabled={busy || done}
        onClick={() => void mark()}
      >
        {busy ? "Saving…" : done ? "Completed" : "Mark complete"}
      </button>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}
