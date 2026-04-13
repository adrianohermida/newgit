import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  INTERNAL_THEME_STORAGE_KEY,
  applyInternalTheme,
  resolveInitialInternalTheme,
  sanitizeInternalThemePreference,
} from "../../lib/interno/theme";

const InternalThemeContext = createContext(null);

export function InternalThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => resolveInitialInternalTheme());

  useEffect(() => {
    applyInternalTheme(theme);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INTERNAL_THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");

    const syncWithSystem = () => {
      const persisted = sanitizeInternalThemePreference(window.localStorage.getItem(INTERNAL_THEME_STORAGE_KEY));
      if (!persisted) {
        setTheme(mediaQuery.matches ? "light" : "dark");
      }
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
      const nextTheme = sanitizeInternalThemePreference(event.newValue);
      if (nextTheme) {
        setTheme(nextTheme);
        return;
      }
      setTheme(resolveInitialInternalTheme());
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const value = useMemo(() => ({
    theme,
    isLightTheme: theme === "light",
    isDarkTheme: theme === "dark",
    setTheme,
    toggleTheme: () => setTheme((current) => (current === "light" ? "dark" : "light")),
  }), [theme]);

  return <InternalThemeContext.Provider value={value}>{children}</InternalThemeContext.Provider>;
}

export function useInternalTheme() {
  const context = useContext(InternalThemeContext);
  if (!context) {
    return {
      theme: "dark",
      isLightTheme: false,
      isDarkTheme: true,
      setTheme: () => undefined,
      toggleTheme: () => undefined,
    };
  }

  return context;
}
