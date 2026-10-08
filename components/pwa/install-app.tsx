"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { usePwa } from "@/components/pwa/pwa-provider";
import { INSTALL_PAUSE_KEY, INSTALL_PAUSE_MS, installSuggestionAllowed, type InstallPlatform } from "@/lib/pwa-install.mjs";
import styles from "./install-app.module.css";

function Instructions({ platform }: { platform: InstallPlatform }) {
  return (
    <div className="pwa-install-instructions" role="status">
      <strong>{platform === "ios" ? "Add to your Home Screen" : "Add from your browser"}</strong>
      <p>
        {platform === "ios"
          ? "In Safari, tap Share, choose Add to Home Screen, then tap Add. If you are in another app, open this page in Safari first."
          : platform === "android"
            ? "Open your browser menu and choose Install app or Add to Home screen. If the option is missing, open this page in Chrome."
            : "Look for Install in your browser’s address bar or menu. On Safari for Mac, choose File → Add to Dock. If your browser has no install option, try Chrome or Edge."}
      </p>
    </div>
  );
}

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const { canPrompt, install, installed, platform, installing } = usePwa();
  const [showInstructions, setShowInstructions] = useState(false);
  const [error, setError] = useState(false);

  if (installed) {
    return compact ? <span className="pwa-installed-label">App installed</span> : null;
  }

  async function beginInstall() {
    const outcome = await install();
    setShowInstructions(outcome === "instructions");
    setError(outcome === "error");
  }

  return (
    <div className={compact ? "pwa-install-control is-compact" : "pwa-install-control"}>
      <button
        className={compact ? "pwa-install-link" : "button button-primary"}
        onClick={() => void beginInstall()}
        type="button"
        disabled={installing}
      >
        {installing ? "Opening install…" : canPrompt ? "Install Her Africa Table" : "Add Her Africa Table"}
      </button>
      {showInstructions ? <Instructions platform={platform} /> : null}
      {error ? <p role="status">Your browser could not open installation. Use its menu to add the app, or try again later.</p> : null}
    </div>
  );
}

export function InstallAppSuggestion() {
  const pathname = usePathname();
  const { canPrompt, install, installed, installing, platform, ready } = usePwa();
  const [visible, setVisible] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setVisible(false);
    setInstructions(false);
    if (!ready || installed) return;
    let pausedUntil: string | null = null;
    try { pausedUntil = localStorage.getItem(INSTALL_PAUSE_KEY); } catch { /* Optional preference storage. */ }
    if (!installSuggestionAllowed(pathname, pausedUntil)) return;
    const timer = window.setTimeout(() => {
      const active = document.activeElement;
      // Never interrupt a form, a conversation draft or an open dialog.
      if (document.querySelector('dialog[open], [role="dialog"]') || active?.matches('input, select, textarea, [contenteditable="true"]')) return;
      setVisible(true);
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [pathname, ready, installed]);

  function pauseSuggestion() {
    setVisible(false);
    try { localStorage.setItem(INSTALL_PAUSE_KEY, String(Date.now() + INSTALL_PAUSE_MS)); } catch { /* Current visit still dismissed. */ }
  }

  async function beginInstall() {
    setError(false);
    const outcome = await install();
    if (outcome === "accepted" || outcome === "dismissed") pauseSuggestion();
    else if (outcome === "instructions") setInstructions(true);
    else setError(true);
  }

  if (!visible || installed) return null;
  return <aside className={styles.suggestion} aria-label="Install Her Africa Table">
    <div className={styles.heading}><img src="/icons/her-africa-table-192.png" alt="" width="40" height="40" /><div><strong>Keep your Table close</strong><p>Open Communities and events from your {platform === "desktop" ? "desktop" : "Home Screen"}.</p></div></div>
    {instructions ? <Instructions platform={platform} /> : null}
    {error ? <p role="status">Installation could not open. Try your browser menu instead.</p> : null}
    <div className={styles.actions}><button onClick={() => void beginInstall()} disabled={installing} type="button">{installing ? "Opening…" : canPrompt ? "Install app" : "Show me how"}</button><button onClick={pauseSuggestion} disabled={installing} type="button">Not now</button></div>
  </aside>;
}

export function InstallAppCard() {
  const { installed } = usePwa();
  return (
    <section className="settings-card settings-action pwa-install-card">
      <div className="pwa-install-card-copy">
        <img alt="" height="64" src="/icons/her-africa-table-192.png" width="64" />
        <div>
          <p className="eyebrow">Her Africa Table on your device</p>
          <h2>{installed ? "The app is installed" : "Open the Table in one tap"}</h2>
          <p>
            {installed
              ? "You can open Her Africa Table from your home screen or app launcher."
              : "Install the secure web app for a full-screen experience and easy access. It uses the same account and needs no app store."}
          </p>
        </div>
      </div>
      <InstallAppButton />
    </section>
  );
}
