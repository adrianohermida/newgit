import { useEffect } from "react";
import { PROCESS_VIEW_ITEMS } from "./constants";
import { loadUiState, persistUiState } from "./storage";

export function useProcessosNavigationState({
  view,
  lastFocusHash,
  setView,
  setLastFocusHash,
  applySavedState,
  persistedState,
  setUiHydrated,
}) {
  useEffect(() => {
    const syncViewFromLocation = () => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      const queryView = url.searchParams.get("view");
      const hashView = window.location.hash ? window.location.hash.replace("#", "") : "";
      const nextView = PROCESS_VIEW_ITEMS.some((item) => item.key === queryView)
        ? queryView
        : PROCESS_VIEW_ITEMS.some((item) => item.key === hashView)
          ? hashView
          : "operacao";
      setView(nextView);
      setLastFocusHash(hashView || nextView);
    };

    syncViewFromLocation();
    if (typeof window !== "undefined") window.addEventListener("hashchange", syncViewFromLocation);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("hashchange", syncViewFromLocation);
    };
  }, [setLastFocusHash, setView]);

  useEffect(() => {
    const saved = loadUiState();
    if (saved) {
      const currentUrl = typeof window !== "undefined" ? new URL(window.location.href) : null;
      const hasExplicitTarget = Boolean(currentUrl?.searchParams.get("view") || String(currentUrl?.hash || "").replace(/^#/, ""));
      if (saved.view && PROCESS_VIEW_ITEMS.some((item) => item.key === saved.view)) setView(saved.view);
      if (!hasExplicitTarget && saved.lastFocusHash) {
        setLastFocusHash(String(saved.lastFocusHash));
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("view", saved.view && PROCESS_VIEW_ITEMS.some((item) => item.key === saved.view) ? saved.view : "operacao");
          url.hash = String(saved.lastFocusHash);
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
      applySavedState?.(saved);
    }
    setUiHydrated(true);
  }, [applySavedState, setLastFocusHash, setUiHydrated, setView]);

  useEffect(() => {
    persistUiState(persistedState);
  }, [persistedState]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const targetHash = String(window.location.hash || "").replace(/^#/, "") || lastFocusHash || view;
    if (!targetHash) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(targetHash);
      if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [view, lastFocusHash]);
}
