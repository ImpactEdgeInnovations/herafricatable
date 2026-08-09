import { JourneyState } from "@/components/shared/journey-state";

export default function AdminLoading() {
  return (
    <main className="route-state-page route-state-admin">
      <JourneyState
        description="Bringing together the latest member, event and safety updates."
        eyebrow="Admin workspace"
        title="Getting today’s work ready…"
        variant="loading"
      />
    </main>
  );
}
