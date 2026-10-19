// A bounded state machine shared by listing, full-poster and event-page images.
// The source is a same-origin, permission-checked endpoint, never an expired token.
export function createPosterRecovery(source: string | null | undefined, changed: () => void, now = Date.now) {
  let state = { url: source || "", failed: false, attempt: 0 };
  let lastRefresh = now();
  let automaticUsed = false;
  const renew = () => {
    lastRefresh = now();
    state = { url: `${source}${source?.includes("?") ? "&" : "?"}retry=${lastRefresh}-${state.attempt + 1}`, failed: false, attempt: state.attempt + 1 };
    changed();
  };
  return {
    read: () => state,
    error(url: string) {
      if (!source || url !== state.url || state.failed) return;
      if (!automaticUsed) { automaticUsed = true; renew(); }
      else { state = { ...state, failed: true }; changed(); }
    },
    timeout(url: string) {
      if (url !== state.url || state.failed) return;
      state = { ...state, failed: true }; changed();
    },
    retry() {
      if (!source || !state.failed) return;
      automaticUsed = true; renew();
    },
    resume() {
      if (!source) return;
      const age = now() - lastRefresh;
      if (age < (state.failed ? 30_000 : 45 * 60_000)) return;
      automaticUsed = true; renew();
    },
  };
}
