type ReadResult = { data?: unknown; error?: unknown; count?: number | null };

/** Never treat a failed, missing or known-truncated list as an empty queue. */
export function adminRowsReady(result: ReadResult | null | undefined) {
  return Boolean(result && !result.error && Array.isArray(result.data) &&
    (result.count == null || result.count === result.data.length));
}

export function adminCountReady(result: { count?: number | null; error?: unknown }) {
  return !result.error && typeof result.count === "number" &&
    Number.isSafeInteger(result.count) && result.count >= 0;
}
