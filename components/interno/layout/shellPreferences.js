export const INTERNAL_RIGHT_RAIL_MODE_STORAGE_KEY = "hmadv:interno:right-rail-mode";
export const INTERNAL_SHELL_PREFERENCES_STORAGE_KEY = "hmadv:interno:shell-preferences";

export function readInternalShellPreferences() {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.localStorage.getItem(INTERNAL_SHELL_PREFERENCES_STORAGE_KEY) || "null";
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeInternalShellPreferences(nextValue) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INTERNAL_SHELL_PREFERENCES_STORAGE_KEY, JSON.stringify(nextValue));
  } catch {
    // noop
  }
}

export function resolveDefaultLeftCollapsed({ isCopilotWorkspace, isMobileShell, width }) {
  if (isMobileShell) return true;
  if (isCopilotWorkspace) return false;
  return width < 1180;
}
