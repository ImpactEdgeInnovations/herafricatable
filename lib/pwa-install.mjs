export const INSTALL_PAUSE_KEY = 'hat-install-paused-until';
export const INSTALL_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;

export function installPlatform(userAgent, maxTouchPoints = 0) {
  if (/iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  return /Android/i.test(userAgent) ? 'android' : 'desktop';
}

export function installSuggestionAllowed(pathname, pausedUntil, now = Date.now()) {
  return ['/', '/home', '/events', '/communities', '/network'].includes(pathname) &&
    !(Number(pausedUntil) > now);
}

// Browsers allow each captured event to be used once, even if the person declines.
export function createInstallRequest(event) {
  let used = false;
  return {
    async run() {
      if (used) return 'instructions';
      used = true;
      try {
        await event.prompt();
        const choice = await event.userChoice;
        return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch {
        return 'error';
      }
    },
  };
}
