import { useEffect, useMemo, useState } from "react";

function buildAiTaskUiStorageKey(profile) {
  const profileId = profile?.id || profile?.email || "anonymous";
  return `hmadv_ai_task_ui_v2:${profileId}`;
}

function safeParseUiState(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function useAiTaskUiState(profile) {
  const uiStorageKey = useMemo(() => buildAiTaskUiStorageKey(profile), [profile]);
  const [historyPage, setHistoryPage] = useState(1);
  const [taskVisibleCount, setTaskVisibleCount] = useState(8);
  const [contact360Query, setContact360Query] = useState("");
  const [contact360Loading, setContact360Loading] = useState(false);
  const [contact360, setContact360] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = safeParseUiState(window.localStorage.getItem(uiStorageKey));
    if (!persisted) return;
    setHistoryPage(Number.isFinite(Number(persisted.historyPage)) ? Number(persisted.historyPage) : 1);
    setTaskVisibleCount(Number.isFinite(Number(persisted.taskVisibleCount)) ? Math.max(8, Number(persisted.taskVisibleCount)) : 8);
    setContact360Query(typeof persisted.contact360Query === "string" ? persisted.contact360Query : "");
    setContact360(persisted.contact360 && typeof persisted.contact360 === "object" ? persisted.contact360 : null);
  }, [uiStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(uiStorageKey, JSON.stringify({ historyPage, taskVisibleCount, contact360Query, contact360 }));
  }, [contact360, contact360Query, historyPage, taskVisibleCount, uiStorageKey]);

  return {
    contact360,
    contact360Loading,
    contact360Query,
    historyPage,
    setContact360,
    setContact360Loading,
    setContact360Query,
    setHistoryPage,
    setTaskVisibleCount,
    taskVisibleCount,
  };
}
