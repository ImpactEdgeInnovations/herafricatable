export function recommendPilotRelease({ blockers, guestRegistrationOpen }) {
  if (guestRegistrationOpen) {
    return blockers.length ? "pause_and_review" : "open_monitor";
  }
  return blockers.length ? "hold" : "ready_for_human_go_no_go";
}
