import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const IDLE_BEFORE_RELOAD_MS = 60 * 1000;
const RELOAD_THROTTLE_MS = 60 * 60 * 1000;
const RELOAD_FLAG_KEY = "vsplus_last_update_reload";

function canReloadNow(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) || "0");
    return Date.now() - last > RELOAD_THROTTLE_MS;
  } catch {
    return true;
  }
}

function markReloaded() {
  try { sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now())); } catch {}
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
        }
      } catch { /* network blip; try again next tick */ }
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
    const bump = () => { lastInteraction.current = Date.now(); };
    const events: (keyof WindowEventMap)[] = ["click", "keydown", "touchstart", "scroll", "mousemove"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true } as any));
    return () => events.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  // Auto-reload on view change (user navigated → safe moment).
  useEffect(() => {
    if (!updateAvailable) return;
    if (viewKey === initialView.current) return;
    if (!canReloadNow()) return;
    markReloaded();
    setTimeout(() => window.location.reload(), 50);
  }, [updateAvailable, viewKey]);

  // Auto-reload on idle (no interaction for 60s).
  useEffect(() => {
    if (!updateAvailable) return;
    const id = setInterval(() => {
      if (Date.now() - lastInteraction.current >= IDLE_BEFORE_RELOAD_MS) {
        clearInterval(id);
        if (!canReloadNow()) return;
        markReloaded();
        window.location.reload();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [updateAvailable]);

  const reloadNow = () => {
    markReloaded();
    window.location.reload();
  };

  return { updateAvailable, reloadNow };
}
