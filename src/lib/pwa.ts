import { useCallback, useEffect, useMemo, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

export type PwaInstallMode =
  | "installed"
  | "prompt"
  | "ios"
  | "manual";

const DISMISS_KEY = "uorqui-pwa-install-dismissed-at";
const SESSION_INTERACTIONS_KEY = "uorqui-pwa-install-interactions";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;
const BANNER_INTERACTIONS = 3;

function iosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function standaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function recentlyDismissed() {
  const value = Number(localStorage.getItem(DISMISS_KEY) || "0");
  return Boolean(value && Date.now() - value < DISMISS_FOR_MS);
}

function sessionInteractions() {
  return Number(sessionStorage.getItem(SESSION_INTERACTIONS_KEY) || "0");
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => standaloneMode());
  const [bannerVisible, setBannerVisible] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [interactionCount, setInteractionCount] = useState(() => sessionInteractions());

  const isIOS = useMemo(() => iosDevice(), []);

  const mode: PwaInstallMode = installed
    ? "installed"
    : deferredPrompt
      ? "prompt"
      : isIOS
        ? "ios"
        : "manual";

  const eligibleForBanner =
    !installed &&
    !recentlyDismissed() &&
    interactionCount >= BANNER_INTERACTIONS &&
    Boolean(deferredPrompt || isIOS);

  useEffect(() => {
    if (eligibleForBanner) setBannerVisible(true);
  }, [eligibleForBanner]);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");

    const updateInstalledState = () => {
      if (standaloneMode()) {
        setInstalled(true);
        setBannerVisible(false);
      }
    };

    const beforeInstall = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      setDeferredPrompt(promptEvent);
    };

    const appInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setBannerVisible(false);
      setInstructionsOpen(false);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    media.addEventListener?.("change", updateInstalledState);

    updateInstalledState();

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
      media.removeEventListener?.("change", updateInstalledState);
    };
  }, []);

  const noteInteraction = useCallback(() => {
    if (installed || bannerVisible) return;
    const next = Math.min(20, sessionInteractions() + 1);
    sessionStorage.setItem(SESSION_INTERACTIONS_KEY, String(next));
    setInteractionCount(next);
  }, [installed, bannerVisible]);

  const dismissBanner = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setBannerVisible(false);
  }, []);

  const install = useCallback(async () => {
    if (installed || installing) return "installed" as const;

    if (!deferredPrompt) {
      setInstructionsOpen(true);
      return "instructions" as const;
    }

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (choice.outcome === "accepted") {
        setBannerVisible(false);
        return "accepted" as const;
      }

      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      setBannerVisible(false);
      return "dismissed" as const;
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt, installed, installing]);

  return {
    installed,
    mode,
    bannerVisible,
    instructionsOpen,
    installing,
    isIOS,
    noteInteraction,
    dismissBanner,
    install,
    openInstructions: () => setInstructionsOpen(true),
    closeInstructions: () => setInstructionsOpen(false),
  };
}
