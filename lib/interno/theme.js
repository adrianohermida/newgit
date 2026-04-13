export const INTERNAL_THEME_STORAGE_KEY = "hmadv:interno:theme";
export const INTERNAL_THEME_ATTRIBUTE = "data-interno-theme";

export function sanitizeInternalThemePreference(value) {
  return value === "light" || value === "dark" ? value : null;
}

export function resolveSystemInternalTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveInitialInternalTheme() {
  if (typeof document !== "undefined") {
    const fromDom = sanitizeInternalThemePreference(
      document.documentElement?.getAttribute(INTERNAL_THEME_ATTRIBUTE) ||
      document.body?.getAttribute(INTERNAL_THEME_ATTRIBUTE)
    );
    if (fromDom) {
      return fromDom;
    }
  }

  if (typeof window !== "undefined") {
    const persisted = sanitizeInternalThemePreference(window.localStorage.getItem(INTERNAL_THEME_STORAGE_KEY));
    if (persisted) {
      return persisted;
    }
  }

  return resolveSystemInternalTheme();
}

export function applyInternalTheme(theme) {
  if (typeof document === "undefined") return;

  const resolved = sanitizeInternalThemePreference(theme) || "dark";
  document.documentElement.setAttribute(INTERNAL_THEME_ATTRIBUTE, resolved);
  document.documentElement.style.colorScheme = resolved;
  if (document.body) {
    document.body.setAttribute(INTERNAL_THEME_ATTRIBUTE, resolved);
    document.body.style.colorScheme = resolved;
  }
}

export function buildInternalThemeBootScript() {
  return `(() => {
    try {
      const storageKey = ${JSON.stringify(INTERNAL_THEME_STORAGE_KEY)};
      const attr = ${JSON.stringify(INTERNAL_THEME_ATTRIBUTE)};
      const stored = window.localStorage.getItem(storageKey);
      const validStored = stored === "light" || stored === "dark" ? stored : null;
      const systemTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      const theme = validStored || systemTheme;
      document.documentElement.setAttribute(attr, theme);
      document.documentElement.style.colorScheme = theme;
      if (document.body) {
        document.body.setAttribute(attr, theme);
        document.body.style.colorScheme = theme;
      } else {
        document.addEventListener("DOMContentLoaded", function applyBodyThemeOnce() {
          document.body && document.body.setAttribute(attr, theme);
          document.body && (document.body.style.colorScheme = theme);
        }, { once: true });
      }
    } catch (error) {
      console.warn("internal-theme-bootstrap-failed", error);
    }
  })();`;
}
