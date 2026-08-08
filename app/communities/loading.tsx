import { JourneyState } from "@/components/shared/journey-state";

export default function CommunityLoading() {
  return (
    <main className="route-state-page">
      <JourneyState
        description="We are preparing your communities and the latest member activity."
        eyebrow="Community"
        title="Opening your communities…"
        variant="loading"
      />
    </main>
  );
}
