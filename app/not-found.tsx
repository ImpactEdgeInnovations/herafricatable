import { JourneyState } from "@/components/shared/journey-state";

export default function NotFound() {
  return (
    <main className="route-state-page">
      <JourneyState
        actions={[
          { href: "/home", label: "Member home", primary: true },
          { href: "/", label: "Landing page" },
        ]}
        description="This page may have moved, or the link may no longer be available."
        eyebrow="Page not found"
        title="This seat isn’t here."
      />
    </main>
  );
}
