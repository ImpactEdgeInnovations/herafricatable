"use client";

import { RouteError } from "@/components/shared/route-error";

export default function CommunityRoomError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      homeHref="/communities"
      homeLabel="Return to your communities"
      reset={reset}
      supportHref="/support"
      title="We couldn’t open this Community area."
    />
  );
}
