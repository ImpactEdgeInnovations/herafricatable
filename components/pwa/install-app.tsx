"use client";

import { useState } from "react";
import { usePwa } from "@/components/pwa/pwa-provider";

function Instructions({ isIos }: { isIos: boolean }) {
  return (
    <div className="pwa-install-instructions" role="status">
      <strong>{isIos ? "Install on iPhone or iPad" : "Install from your browser"}</strong>
      <p>
        {isIos
          ? "Open this page in Safari, tap Share, then choose Add to Home Screen."
          : "Open your browser menu and choose Install Her Africa Table or Add to Home screen."}
      </p>
    </div>
  );
}

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const { canPrompt, install, installed, isIos } = usePwa();
  const [showInstructions, setShowInstructions] = useState(false);

  if (installed) {
    return compact ? <span className="pwa-installed-label">App installed</span> : null;
  }

  async function beginInstall() {
    const outcome = await install();
    setShowInstructions(outcome === "instructions");
  }

  return (
    <div className={compact ? "pwa-install-control is-compact" : "pwa-install-control"}>
      <button
        className={compact ? "pwa-install-link" : "button button-primary"}
        onClick={() => void beginInstall()}
        type="button"
      >
        {canPrompt ? "Install Her Africa Table" : "Add app to your phone"}
      </button>
      {showInstructions ? <Instructions isIos={isIos} /> : null}
    </div>
  );
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
