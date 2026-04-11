import { useEffect, useRef } from "react";
import { appendActivityLog, setModuleHistory } from "../lib/admin/activity-log";

function buildPageLabel(pathname) {
  if (!pathname) return "rota-desconhecida";
  return pathname
    .replace(/^\/+/, "")
    .replace(/\//g, " > ")
    .replace(/\[|\]/g, "")
    || "home";
}

export default function useConsoleRouteInstrumentation(router) {
  const routeStartRef = useRef({ path: "", startedAt: 0 });

  useEffect(() => {
    if (!router?.pathname) return;

    setModuleHistory("app-shell", {
      routePath: router.pathname,
      asPath: router.asPath || router.pathname,
      pageLabel: buildPageLabel(router.pathname),
      routeKind: router.pathname.startsWith("/interno")
        ? "interno"
        : router.pathname.startsWith("/portal")
          ? "portal"
          : router.pathname.startsWith("/api")
            ? "api"
            : "publico",
      lastNavigationAt: new Date().toISOString(),
    });
  }, [router?.pathname, router?.asPath]);

  useEffect(() => {
    if (!router?.events) return undefined;

    function handleStart(url) {
      routeStartRef.current = { path: url, startedAt: Date.now() };
      appendActivityLog({
        label: "Navegacao iniciada",
        action: "route_change_start",
        method: "ROUTER",
        page: router.pathname,
        path: url,
        status: "running",
        response: `Iniciando navegacao para ${url}`,
        tags: ["navigation", "app-shell"],
      });
    }

    function handleComplete(url) {
      const startedAt = routeStartRef.current.startedAt || Date.now();
      appendActivityLog({
        label: "Navegacao concluida",
        action: "route_change_complete",
        method: "ROUTER",
        page: router.pathname,
        path: url,
        status: "success",
        durationMs: Date.now() - startedAt,
        response: `Rota ativa: ${url}`,
        tags: ["navigation", "app-shell"],
      });
      setModuleHistory("app-shell", {
        routePath: router.pathname,
        asPath: url,
        pageLabel: buildPageLabel(router.pathname),
        lastNavigationAt: new Date().toISOString(),
        lastNavigationDurationMs: Date.now() - startedAt,
      });
    }

    function handleError(error, url) {
      appendActivityLog({
        label: "Falha de navegacao",
        action: "route_change_error",
        method: "ROUTER",
        page: router.pathname,
        path: url,
        status: "error",
        error: error?.message || String(error || "Falha desconhecida na navegacao."),
        tags: ["navigation", "app-shell"],
      });
    }

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleComplete);
    router.events.on("routeChangeError", handleError);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleComplete);
      router.events.off("routeChangeError", handleError);
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function handleError(event) {
      appendActivityLog({
        label: "Erro de runtime",
        action: "window_error",
        method: "WINDOW",
        page: window.location.pathname,
        path: window.location.href,
        status: "error",
        component: "runtime",
        error: event?.error?.stack || event?.message || "Erro de runtime sem detalhes.",
        tags: ["runtime", "frontend", "app-shell"],
      });
    }

    function handleRejection(event) {
      const reason = event?.reason;
      appendActivityLog({
        label: "Promise rejeitada",
        action: "unhandled_rejection",
        method: "WINDOW",
        page: window.location.pathname,
        path: window.location.href,
        status: "error",
        component: "runtime",
        error: reason?.stack || reason?.message || String(reason || "Unhandled rejection"),
        tags: ["runtime", "frontend", "app-shell"],
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
}
