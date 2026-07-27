"use client";

import { RouteError } from "@/components/shared/route-error";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <RouteError
          homeHref="/"
          homeLabel="Return to the landing page"
          reset={reset}
          supportHref="/sign-in"
          title="Her Africa Table needs a moment."
        />
      </body>
    </html>
  );
}
