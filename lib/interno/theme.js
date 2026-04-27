export const INTERNAL_THEME_STORAGE_KEY = "hmadv:interno:theme";
export const INTERNAL_THEME_ATTRIBUTE = "data-interno-theme";
export const INTERNAL_THEME_PREFERENCE_ATTRIBUTE = "data-interno-theme-preference";
export const INTERNAL_THEME_META_COLOR_ID = "theme-color";

export function sanitizeInternalThemePreference(value) {
  return value === "light" || value === "dark" || value === "system" ? value : null;
}

export function sanitizeInternalResolvedTheme(value) {
  return value === "light" || value === "dark" ? value : null;
}

export function resolveSystemInternalTheme() {
  return "dark";
}

export function resolveInternalTheme(preference) {
  const sanitizedPreference = sanitizeInternalThemePreference(preference) || "system";
  return sanitizedPreference === "system" ? resolveSystemInternalTheme() : sanitizedPreference;
}

export function resolveStoredInternalThemePreference() {
  if (typeof window === "undefined") {
    return "dark";
  }

  return sanitizeInternalThemePreference(window.localStorage.getItem(INTERNAL_THEME_STORAGE_KEY)) || "dark";
}

export function resolveInitialInternalThemeState() {
  if (typeof document !== "undefined") {
    const domPreference = sanitizeInternalThemePreference(
      document.documentElement?.getAttribute(INTERNAL_THEME_PREFERENCE_ATTRIBUTE) ||
      document.body?.getAttribute(INTERNAL_THEME_PREFERENCE_ATTRIBUTE)
    );
    const domResolvedTheme = sanitizeInternalResolvedTheme(
      document.documentElement?.getAttribute(INTERNAL_THEME_ATTRIBUTE) ||
      document.body?.getAttribute(INTERNAL_THEME_ATTRIBUTE)
    );

    if (domPreference && domResolvedTheme) {
      return {
        preference: domPreference,
        resolvedTheme: domResolvedTheme,
      };
    }
  }

  return {
    preference: "dark",
    resolvedTheme: "dark",
  };
}

export function resolveInitialInternalTheme() {
  return resolveInitialInternalThemeState().resolvedTheme;
}

export function applyInternalTheme(theme, preference = "system") {
  if (typeof document === "undefined") return;

  const resolved = sanitizeInternalResolvedTheme(theme) || "dark";
  const sanitizedPreference = sanitizeInternalThemePreference(preference) || "system";
  const root = document.documentElement;
  const body = document.body;
  const themeColor = resolved === "light" ? "#EEF2F6" : "#07110E";

  root.setAttribute(INTERNAL_THEME_ATTRIBUTE, resolved);
  root.setAttribute(INTERNAL_THEME_PREFERENCE_ATTRIBUTE, sanitizedPreference);
  root.style.colorScheme = resolved;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");

  if (body) {
    body.setAttribute(INTERNAL_THEME_ATTRIBUTE, resolved);
    body.setAttribute(INTERNAL_THEME_PREFERENCE_ATTRIBUTE, sanitizedPreference);
    body.style.colorScheme = resolved;
    body.classList.toggle("dark", resolved === "dark");
    body.classList.toggle("light", resolved === "light");
  }

  const metaThemeColor = document.querySelector(`meta[name="${INTERNAL_THEME_META_COLOR_ID}"]`);
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", themeColor);
  }
}

export function buildInternalThemeBootScript() {
  return `(() => {
    try {
      const storageKey = ${JSON.stringify(INTERNAL_THEME_STORAGE_KEY)};
      const attr = ${JSON.stringify(INTERNAL_THEME_ATTRIBUTE)};
      const preferenceAttr = ${JSON.stringify(INTERNAL_THEME_PREFERENCE_ATTRIBUTE)};
      const metaName = ${JSON.stringify(INTERNAL_THEME_META_COLOR_ID)};
      const stored = window.localStorage.getItem(storageKey);
      const preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
      const systemTheme = "dark";
      const resolvedTheme = "dark";
      const applyTheme = (target) => {
        if (!target) return;
        target.setAttribute(attr, resolvedTheme);
        target.setAttribute(preferenceAttr, preference);
        target.style.colorScheme = resolvedTheme;
        target.classList && target.classList.toggle("dark", resolvedTheme === "dark");
        target.classList && target.classList.toggle("light", resolvedTheme === "light");
      };
      applyTheme(document.documentElement);
      if (document.body) {
        applyTheme(document.body);
      } else {
        document.addEventListener("DOMContentLoaded", function applyBodyThemeOnce() {
          applyTheme(document.body);
        }, { once: true });
      }
      const metaThemeColor = document.querySelector('meta[name="' + metaName + '"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute("content", resolvedTheme === "light" ? "#EEF2F6" : "#07110E");
      }
    } catch (error) {
      console.warn("internal-theme-bootstrap-failed", error);
    }
  })();`;
}
