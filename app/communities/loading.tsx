import { JourneyState } from "@/components/shared/journey-state";

export default function CommunityLoading() {
  return (
    <main className="route-state-page">
      <JourneyState
        description="We are opening your communities and checking what is new."
        eyebrow="Community"
        title="Opening your communities…"
        variant="loading"
      />
    </main>
  );
}
