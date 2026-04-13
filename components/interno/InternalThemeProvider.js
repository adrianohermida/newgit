import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  INTERNAL_THEME_STORAGE_KEY,
  applyInternalTheme,
  resolveInitialInternalThemeState,
  resolveInternalTheme,
  sanitizeInternalThemePreference,
} from "../../lib/interno/theme";

const InternalThemeContext = createContext(null);

export function InternalThemeProvider({ children }) {
  const [themeState, setThemeState] = useState(() => resolveInitialInternalThemeState());
  const preference = themeState.preference;
  const theme = themeState.resolvedTheme;

  useEffect(() => {
    if (typeof window === "undefined") return;

    applyInternalTheme(theme, preference);
    window.localStorage.setItem(INTERNAL_THEME_STORAGE_KEY, preference);
  }, [preference, theme]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");

    const syncWithSystem = () => {
      setThemeState((current) => (
        current.preference === "system"
          ? { preference: "system", resolvedTheme: mediaQuery.matches ? "light" : "dark" }
          : current
      ));
    };

    syncWithSystem();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncWithSystem);
      return () => mediaQuery.removeEventListener("change", syncWithSystem);
    }

    mediaQuery.addListener(syncWithSystem);
    return () => mediaQuery.removeListener(syncWithSystem);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function handleStorage(event) {
      if (event.key !== INTERNAL_THEME_STORAGE_KEY) return;
      const nextPreference = sanitizeInternalThemePreference(event.newValue) || "system";
      setThemeState({
        preference: nextPreference,
        resolvedTheme: resolveInternalTheme(nextPreference),
      });
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setThemePreference = (nextPreference) => {
    const sanitizedPreference = sanitizeInternalThemePreference(nextPreference) || "system";
    setThemeState({
      preference: sanitizedPreference,
      resolvedTheme: resolveInternalTheme(sanitizedPreference),
    });
  };

  const value = useMemo(() => ({
    preference,
    theme,
    isLightTheme: theme === "light",
    isDarkTheme: theme === "dark",
    usesSystemTheme: preference === "system",
    setTheme: (nextTheme) => {
      const resolvedPreference = typeof nextTheme === "function"
        ? nextTheme(theme)
        : nextTheme;
      setThemePreference(resolvedPreference);
    },
    setThemePreference,
    toggleTheme: () => setThemePreference(theme === "light" ? "dark" : "light"),
    resetThemePreference: () => setThemePreference("system"),
  }), [preference, theme]);

  return <InternalThemeContext.Provider value={value}>{children}</InternalThemeContext.Provider>;
}

export function useInternalTheme() {
  const context = useContext(InternalThemeContext);
  if (!context) {
    return {
      preference: "system",
      theme: "dark",
      isLightTheme: false,
      isDarkTheme: true,
      usesSystemTheme: true,
      setTheme: () => undefined,
      setThemePreference: () => undefined,
      toggleTheme: () => undefined,
      resetThemePreference: () => undefined,
    };
  }

  return context;
}
