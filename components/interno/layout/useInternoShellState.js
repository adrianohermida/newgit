import { useEffect, useRef, useState } from "react";
import { INTERNAL_RIGHT_RAIL_MODE_STORAGE_KEY, readInternalShellPreferences, resolveDefaultLeftCollapsed, writeInternalShellPreferences } from "./shellPreferences";

export function useInternoShellState({ isCopilotWorkspace, shouldRenderDotobotRail, shouldStartWithOpenRail, getConsoleHeightLimits }) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(!shouldStartWithOpenRail);
  const [rightRailMode, setRightRailMode] = useState("expanded");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(shouldStartWithOpenRail);
  const [isMobileShell, setIsMobileShell] = useState(false);
  const [consoleTab, setConsoleTab] = useState("console");
  const [logPane, setLogPane] = useState("activity");
  const [consoleHeight, setConsoleHeight] = useState(() => getConsoleHeightLimits().preferred);
  const shellPreferencesHydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persistedMode = window.localStorage.getItem(INTERNAL_RIGHT_RAIL_MODE_STORAGE_KEY);
    if (persistedMode === "compact" || persistedMode === "expanded") setRightRailMode(persistedMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INTERNAL_RIGHT_RAIL_MODE_STORAGE_KEY, rightRailMode);
  }, [rightRailMode]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function syncResponsiveShell() {
      const width = window.innerWidth;
      const mobile = width < 900;
      setIsMobileShell(mobile);
      if (!shellPreferencesHydratedRef.current) {
        setLeftCollapsed(resolveDefaultLeftCollapsed({ isCopilotWorkspace, isMobileShell: mobile, width }));
        if (width < 1024) {
          setRightCollapsed(true);
          setCopilotOpen(false);
          setRightRailMode("compact");
        }
      }
    }
    syncResponsiveShell();
    window.addEventListener("resize", syncResponsiveShell);
    return () => window.removeEventListener("resize", syncResponsiveShell);
  }, [isCopilotWorkspace]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = readInternalShellPreferences();
    const width = window.innerWidth;
    const isDesktopShell = width >= 900;
    const limits = getConsoleHeightLimits();
    if (persisted) {
      if (isCopilotWorkspace && isDesktopShell) setLeftCollapsed(false);
      else if (typeof persisted.desktopLeftCollapsed === "boolean" && isDesktopShell) setLeftCollapsed(persisted.desktopLeftCollapsed);
      if (typeof persisted.mobileLeftCollapsed === "boolean" && !isDesktopShell) setLeftCollapsed(persisted.mobileLeftCollapsed);
      else if (!isDesktopShell) setLeftCollapsed(true);
      if (typeof persisted.consoleOpen === "boolean") setConsoleOpen(persisted.consoleOpen);
      if (persisted.consoleTab === "console" || persisted.consoleTab === "log") setConsoleTab(persisted.consoleTab);
      if (typeof persisted.logPane === "string" && persisted.logPane) setLogPane(persisted.logPane);
      if (typeof persisted.desktopRightCollapsed === "boolean" && width >= 1024) {
        setRightCollapsed(persisted.desktopRightCollapsed);
        setCopilotOpen(!persisted.desktopRightCollapsed);
      }
      if ((persisted.rightRailMode === "compact" || persisted.rightRailMode === "expanded") && width >= 1024) setRightRailMode(persisted.rightRailMode);
      if (typeof persisted.consoleHeight === "number") setConsoleHeight(Math.min(limits.max, Math.max(limits.min, persisted.consoleHeight)));
    } else {
      setLeftCollapsed(resolveDefaultLeftCollapsed({ isCopilotWorkspace, isMobileShell: !isDesktopShell, width }));
    }
    shellPreferencesHydratedRef.current = true;
  }, [getConsoleHeightLimits, isCopilotWorkspace]);

  useEffect(() => {
    if (!shellPreferencesHydratedRef.current) return;
    writeInternalShellPreferences({
      desktopLeftCollapsed: !isMobileShell ? leftCollapsed : undefined,
      mobileLeftCollapsed: isMobileShell ? leftCollapsed : undefined,
      desktopRightCollapsed: !isMobileShell ? rightCollapsed : true,
      rightRailMode,
      consoleOpen,
      consoleTab,
      logPane,
      consoleHeight,
    });
  }, [consoleHeight, consoleOpen, consoleTab, isMobileShell, leftCollapsed, logPane, rightCollapsed, rightRailMode]);

  useEffect(() => {
    if (!shellPreferencesHydratedRef.current) return;
    if (isMobileShell) {
      setRightCollapsed(true);
      setCopilotOpen(false);
      return;
    }
    if (shouldStartWithOpenRail) {
      setRightCollapsed(false);
      setCopilotOpen(true);
    }
  }, [isMobileShell, shouldStartWithOpenRail]);

  function closeMobileSidebar() {
    if (isMobileShell) setLeftCollapsed(true);
  }

  function toggleRightRailMode() {
    setRightRailMode((current) => (current === "compact" ? "expanded" : "compact"));
    if (rightCollapsed) {
      setRightCollapsed(false);
      setCopilotOpen(true);
    }
  }

  function handleToggleRightRail() {
    if (!shouldRenderDotobotRail) return;
    setRightCollapsed((current) => {
      const nextCollapsed = !current;
      if (!nextCollapsed) setCopilotOpen(true);
      return nextCollapsed;
    });
  }

  function handleToggleCopilot() {
    if (!shouldRenderDotobotRail) return;
    setCopilotOpen((current) => {
      const next = !current;
      setRightCollapsed(!next);
      return next;
    });
  }

  return { closeMobileSidebar, consoleHeight, consoleOpen, consoleTab, copilotOpen, handleToggleCopilot, handleToggleRightRail, isMobileShell, leftCollapsed, logPane, rightCollapsed, rightRailMode, setConsoleHeight, setConsoleOpen, setConsoleTab, setLeftCollapsed, setLogPane, toggleRightRailMode };
}
