"use client";

import { RouteError } from "@/components/shared/route-error";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      homeHref="/home"
      homeLabel="Return to member home"
      reset={reset}
      supportHref="/support"
      title="We couldn’t finish loading this page."
    />
  );
}
