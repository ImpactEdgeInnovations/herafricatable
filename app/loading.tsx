import { JourneyState } from "@/components/shared/journey-state";

export default function Loading() {
  return (
    <main className="route-state-page">
      <JourneyState
        description="We are securely preparing your account and the latest table updates."
        eyebrow="Her Africa Table"
        title="Preparing your table…"
        variant="loading"
      />
    </main>
  );
}
