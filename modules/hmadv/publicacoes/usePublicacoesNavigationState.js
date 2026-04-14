import { useEffect } from "react";
import { PUBLICACOES_VIEW_ITEMS } from "./constants";
import { loadUiState, persistUiState } from "./storage";

export function usePublicacoesNavigationState({
  view,
  lastFocusHash,
  setView,
  setLastFocusHash,
}) {
  useEffect(() => {
    const syncViewFromLocation = () => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      const queryView = url.searchParams.get("view");
      const hashView = window.location.hash ? window.location.hash.replace("#", "") : "";
      if (!queryView && !hashView) {
        const saved = loadUiState();
        if (saved?.view && PUBLICACOES_VIEW_ITEMS.some((item) => item.key === saved.view)) {
          setView(saved.view);
          if (saved.lastFocusHash) {
            setLastFocusHash(String(saved.lastFocusHash));
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.set("view", saved.view);
            nextUrl.hash = String(saved.lastFocusHash);
            window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
          }
          return;
        }
      }
      const nextView = PUBLICACOES_VIEW_ITEMS.some((item) => item.key === queryView)
        ? queryView
        : PUBLICACOES_VIEW_ITEMS.some((item) => item.key === hashView)
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
    persistUiState({ view, lastFocusHash });
  }, [view, lastFocusHash]);

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
