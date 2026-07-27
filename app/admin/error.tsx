"use client";

import { RouteError } from "@/components/shared/route-error";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      homeHref="/admin"
      homeLabel="Return to Admin"
      reset={reset}
      supportHref="/admin/support"
      title="Admin operations couldn’t finish loading."
    />
  );
}
