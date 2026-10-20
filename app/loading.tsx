import { JourneyState } from "@/components/shared/journey-state";

export default function Loading() {
  return (
    <main className="route-state-page">
      <JourneyState
        description="Your page will be ready in a moment."
        eyebrow="Her Africa Table"
        title="Opening Her Africa Table…"
        variant="loading"
      />
    </main>
  );
}
