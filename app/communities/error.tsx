"use client";

import { RouteError } from "@/components/shared/route-error";

export default function CommunityError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      homeHref="/home"
      homeLabel="Return to member home"
      reset={reset}
      supportHref="/support"
      title="We couldn’t open Community."
    />
  );
}
