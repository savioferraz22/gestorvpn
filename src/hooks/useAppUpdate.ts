import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const IDLE_BEFORE_RELOAD_MS = 60 * 1000;
const RELOAD_THROTTLE_MS = 60 * 60 * 1000;
const RELOAD_FLAG_KEY = "vsplus_last_update_reload";
const FAILSAFE_RELOAD_MS = 4000;

function canReloadNow(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) || "0");
    return Date.now() - last > RELOAD_THROTTLE_MS;
  } catch {
    return true;
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

// Hard reload that bypasses HTTP cache.
function hardReload() {
  try {
    // Drop the search/hash so the next load is a clean entry.
    const url = window.location.pathname + window.location.search;
    window.location.replace(url);
  } catch {
    window.location.reload();
  }
}

// Activate the waiting Service Worker (if any) so the next load serves
// the new precached bundle instead of the stale one.
async function activateWaitingSW(reg: ServiceWorkerRegistration): Promise<boolean> {
  return new Promise((resolve) => {
    const waiting = reg.waiting;
    const installing = reg.installing;

    const finish = (ok: boolean) => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(ok);
    };
    const onChange = () => finish(true);

    if (waiting) {
      navigator.serviceWorker.addEventListener("controllerchange", onChange);
      waiting.postMessage({ type: "SKIP_WAITING" });
      setTimeout(() => finish(false), FAILSAFE_RELOAD_MS);
      return;
    }

    if (installing) {
      navigator.serviceWorker.addEventListener("controllerchange", onChange);
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      });
      setTimeout(() => finish(false), FAILSAFE_RELOAD_MS);
      return;
    }

    // No update pipeline — let the caller fall back to a plain reload.
    resolve(false);
  });
}

async function performUpdate(): Promise<void> {
  markReloaded();
  if (!("serviceWorker" in navigator)) {
    hardReload();
    return;
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      hardReload();
      return;
    }

    // Ask the browser to recheck the SW so a new build that landed mid-session
    // gets picked up.
    try {
      await reg.update();
    } catch {
      // ignore — fall through to whatever state we have
    }

    const swapped = await activateWaitingSW(reg);
    if (swapped) {
      hardReload();
      return;
    }

    // No waiting/installing worker — try unregistering as a last resort so the
    // next load fetches fresh assets.
    try {
      await reg.unregister();
    } catch {
      // ignore
    }
    hardReload();
  } catch {
    hardReload();
  }
}

export function useAppUpdate(viewKey: string) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const lastInteraction = useRef(Date.now());
  const initialView = useRef(viewKey);
  const initialVersion = useRef<string | null>(null);

  // Poll /version.json and compare with the version baked into this bundle.
  useEffect(() => {
    if (typeof __APP_VERSION__ === "undefined") return;
    initialVersion.current = __APP_VERSION__;
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.version) return;
        if (data.version !== initialVersion.current) {
          setUpdateAvailable(true);
          // Nudge the browser to fetch the new SW so it's ready by the time
          // the user taps the banner.
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker
              .getRegistration()
              .then((reg) => reg?.update())
              .catch(() => undefined);
          }
        }
      } catch {
        // network blip; try again next tick
      }
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Track interaction so we know when the user is idle.
  useEffect(() => {
    const bump = () => {
      lastInteraction.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ["click", "keydown", "touchstart", "scroll", "mousemove"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true } as any));
    return () => events.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  // Auto-reload on view change (user navigated → safe moment).
  useEffect(() => {
    if (!updateAvailable) return;
    if (viewKey === initialView.current) return;
    if (!canReloadNow()) return;
    void performUpdate();
  }, [updateAvailable, viewKey]);

  // Auto-reload on idle (no interaction for 60s).
  useEffect(() => {
    if (!updateAvailable) return;
    const id = setInterval(() => {
      if (Date.now() - lastInteraction.current >= IDLE_BEFORE_RELOAD_MS) {
        clearInterval(id);
        if (!canReloadNow()) return;
        void performUpdate();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [updateAvailable]);

  const reloadNow = () => {
    void performUpdate();
  };

  return { updateAvailable, reloadNow };
}
