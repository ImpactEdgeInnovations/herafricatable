export type NetworkingSession = {
  starts_at: string; ends_at: string; minutes: number; changeover: number;
  status: "scheduled" | "running" | "paused" | "finished"; disabled: boolean;
  round_no: number; round_ends_at: string | null; next_at: string | null;
  prompt: string; points: string[] | null;
};
export type NetworkingState = {
  server_now: string; can_manage: boolean; is_admin?: boolean; eligible?: boolean;
  joined?: boolean; introduction?: string; session: NetworkingSession | null;
  match?: { id: string; status: "offered" | "active"; point: string; ends_at: string;
    accept_by: string; accepted: boolean; person: { name: string; avatar_url: string | null; introduction: string } };
  met?: { match_id: string; name: string }[];
  people?: { name: string; ready: boolean; paired: boolean }[];
  help?: { id: string; name: string; note: string; created_at: string }[];
};
export function networkingRemaining(end: string | null | undefined, serverNow: number) {
  return end ? Math.max(0, Math.ceil((Date.parse(end) - serverNow) / 1000)) : 0;
}
export function networkingCountdown(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function networkingPhase(state: NetworkingState, now: number) {
  const s = state.session;
  if (!s) return "not_scheduled";
  if (s.disabled) return "disabled";
  if (s.status === "finished" || now >= Date.parse(s.ends_at)) return "finished";
  if (s.status === "paused") return "paused";
  if (s.status === "scheduled") return "scheduled";
  if (state.match && networkingRemaining(state.match.ends_at, now) > 0) {
    if (state.match.status === "active") return "talking";
    if (networkingRemaining(state.match.accept_by, now) > 0) return "offered";
  }
  if (s.round_ends_at && now >= Date.parse(s.round_ends_at)) return "changeover";
  return "waiting";
}
