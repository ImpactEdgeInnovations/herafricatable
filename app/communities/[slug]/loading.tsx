import { JourneyState } from "@/components/shared/journey-state";

export default function CommunityRoomLoading() {
  return (
    <main className="route-state-page">
      <JourneyState
        description="We are loading only the Community area you selected."
        eyebrow="Community"
        title="Opening this space…"
        variant="loading"
      />
    </main>
  );
}
