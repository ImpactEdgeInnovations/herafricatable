import { JourneyState } from "@/components/shared/journey-state";

export default function AdminLoading() {
  return (
    <main className="route-state-page route-state-admin">
      <JourneyState
        description="Loading current queues, launch readiness, and authorized operations."
        eyebrow="Admin command center"
        title="Preparing live operations…"
        variant="loading"
      />
    </main>
  );
}
