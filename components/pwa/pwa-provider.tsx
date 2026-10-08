"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createInstallRequest, installPlatform, type InstallOutcome, type InstallPlatform } from "@/lib/pwa-install.mjs";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaContextValue = {
  canPrompt: boolean;
  install: () => Promise<InstallOutcome>;
  installing: boolean;
  ready: boolean;
  platform: InstallPlatform;
  installed: boolean;
  isIos: boolean;
};

const PwaContext = createContext<PwaContextValue>({
  canPrompt: false,
  install: async () => "instructions",
  installed: false,
  isIos: false,
  installing: false,
  ready: false,
  platform: "desktop",
});

function runningStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<ReturnType<typeof createInstallRequest> | null>(null);
  const installBusy = useRef(false);
  const [installing, setInstalling] = useState(false);
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setInstalled(runningStandalone());
    const device = installPlatform(navigator.userAgent, navigator.maxTouchPoints);
    setPlatform(device);
    setIsIos(device === "ios");
    setReady(true);

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(createInstallRequest(event as InstallPromptEvent));
    };
    const markInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const detectStandalone = () => { if (runningStandalone()) markInstalled(); };
    displayMode.addEventListener("change", detectStandalone);

    if ("serviceWorker" in navigator && window.location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Installation remains progressively enhanced if registration is unavailable.
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
      displayMode.removeEventListener("change", detectStandalone);
    };
  }, []);

  const value = useMemo<PwaContextValue>(() => ({
    canPrompt: Boolean(prompt),
    installed,
    isIos,
    platform,
    ready,
    installing,
    install: async () => {
      if (installBusy.current) return "dismissed";
      if (!prompt) return "instructions";
      installBusy.current = true;
      setInstalling(true);
      setPrompt(null);
      try {
        const outcome = await prompt.run();
        if (outcome === "accepted") setInstalled(true);
        return outcome;
      } finally {
        installBusy.current = false;
        setInstalling(false);
      }
    },
  }), [installed, isIos, platform, ready, installing, prompt]);

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  return useContext(PwaContext);
}
