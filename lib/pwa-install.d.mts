export type InstallOutcome = "accepted" | "dismissed" | "instructions" | "error";
export type InstallPlatform = "ios" | "android" | "desktop";
export const INSTALL_PAUSE_KEY: string;
export const INSTALL_PAUSE_MS: number;
export function installPlatform(userAgent: string, maxTouchPoints?: number): InstallPlatform;
export function installSuggestionAllowed(pathname: string, pausedUntil: string | null, now?: number): boolean;
export function createInstallRequest(event: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }): { run: () => Promise<InstallOutcome> };
