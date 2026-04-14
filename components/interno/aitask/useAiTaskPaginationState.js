import { useEffect } from "react";

export default function useAiTaskPaginationState({
  recentHistoryLength,
  setHistoryPage,
  setTaskVisibleCount,
  taskCount,
  taskVisibleCount,
}) {
  useEffect(() => {
    setHistoryPage(1);
  }, [recentHistoryLength, setHistoryPage]);

  useEffect(() => {
    if (taskVisibleCount > taskCount && taskCount > 0) {
      setTaskVisibleCount(Math.max(8, taskCount));
    }
  }, [setTaskVisibleCount, taskCount, taskVisibleCount]);
}
