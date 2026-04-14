import { useEffect, useMemo } from "react";
import { NAV_ITEMS } from "./sidebarConfig";

export function useInternoShellUi({
  consoleHeight,
  consoleOpen,
  coverageCards,
  dragStateRef,
  getConsoleHeightLimits,
  headerSearch,
  headerSearchRef,
  operationalNotes,
  router,
  setConsoleHeight,
  setHeaderSearch,
  setSettingsOpen,
  setUserMenuOpen,
  settingsModalRef,
  userMenuRef,
}) {
  const headerSearchResults = useMemo(() => {
    if (!headerSearch.trim()) return [];
    const needle = headerSearch.trim().toLowerCase();
    const routeMatches = NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(needle) || item.href.toLowerCase().includes(needle)).map((item) => ({ key: `route_${item.href}`, label: item.label, helper: item.href, href: item.href, type: "modulo" }));
    const snapshotMatches = coverageCards.filter((item) => [item.label, item.key, item.routePath, item.summary].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))).map((item) => ({ key: `snapshot_${item.key}`, label: item.label || item.key, helper: item.summary || item.routePath || "Snapshot operacional", href: item.routePath || `/interno/${item.key}`, type: "snapshot" }));
    const noteMatches = operationalNotes.filter((item) => String(item?.note || item?.title || "").toLowerCase().includes(needle)).slice(0, 4).map((item, index) => ({ key: `note_${item.createdAt || index}`, label: item.title || "Nota operacional", helper: item.note || "Registro interno", href: null, type: "nota" }));
    return [...routeMatches, ...snapshotMatches, ...noteMatches].slice(0, 8);
  }, [coverageCards, headerSearch, operationalNotes]);

  useEffect(() => {
    function handleMove(event) {
      if (!dragStateRef.current.dragging) return;
      const delta = dragStateRef.current.startY - event.clientY;
      const limits = getConsoleHeightLimits();
      setConsoleHeight(Math.min(limits.max, Math.max(limits.min, dragStateRef.current.startHeight + delta)));
    }
    function handleUp() {
      dragStateRef.current.dragging = false;
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragStateRef, getConsoleHeightLimits, setConsoleHeight]);

  useEffect(() => {
    function syncConsoleHeightToViewport() {
      const limits = getConsoleHeightLimits();
      const safeCurrent = Number(consoleHeight || 0) || limits.preferred;
      setConsoleHeight(Math.min(limits.max, Math.max(limits.min, safeCurrent)));
    }
    syncConsoleHeightToViewport();
    window.addEventListener("resize", syncConsoleHeightToViewport);
    return () => window.removeEventListener("resize", syncConsoleHeightToViewport);
  }, [consoleHeight, getConsoleHeightLimits, setConsoleHeight]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) setUserMenuOpen(false);
      if (settingsModalRef.current && !settingsModalRef.current.contains(event.target)) setSettingsOpen(false);
      if (headerSearchRef.current && !headerSearchRef.current.contains(event.target)) setHeaderSearch("");
    };
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      setUserMenuOpen(false);
      setSettingsOpen(false);
      setHeaderSearch("");
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [headerSearchRef, setHeaderSearch, setSettingsOpen, setUserMenuOpen, settingsModalRef, userMenuRef]);

  function handleStartResize(event) {
    if (!consoleOpen) return;
    dragStateRef.current.dragging = true;
    dragStateRef.current.startY = event.clientY;
    dragStateRef.current.startHeight = consoleHeight;
  }

  function handleHeaderSearchSelect(result) {
    if (result?.href) router.push(result.href);
    setHeaderSearch("");
  }

  return { handleHeaderSearchSelect, handleStartResize, headerSearchResults };
}
