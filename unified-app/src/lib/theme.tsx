/**
 * Theme (light / dark) runtime.
 *
 * Dark mode was previously configured but not implemented: `tailwind.config.ts`
 * had `darkMode: ["class"]` and `index.css` defined a full `.dark` token block,
 * but nothing ever put `.dark` on `<html>`, so the app could never render dark
 * and the call to `useTheme()` in `ui/sonner.tsx` read from an empty context.
 *
 * This module owns three things that are easy to get wrong:
 *
 *   1. Persistence — the choice is stored under `STORAGE_KEY` in localStorage.
 *   2. System preference — a visitor who has never chosen follows
 *      `prefers-color-scheme`, and keeps following it if the OS setting changes,
 *      right up until they make an explicit choice.
 *   3. No flash on load — `index.html` runs the same resolution logic as a
 *      blocking inline script in <head>, so the correct theme is on the
 *      document before the first paint. That script is the reason this is
 *      hand-rolled rather than delegated to `next-themes`, whose equivalent
 *      script is injected from inside the React tree and therefore runs after
 *      the first styles are already applied.
 *
 * The storage key is shared with that script. Changing it here without changing
 * index.html would break the no-flash behaviour; `e2e/signin-flow.py` asserts
 * both surfaces agree.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const STORAGE_KEY = "nabhacare.theme";

/** `system` is a real, user-selectable state — it is not the same as unset. */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function readStored(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  } catch {
    // Private browsing, or storage disabled. Fall through to the system value.
    return null;
  }
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

type ThemeContextValue = {
  /** What the user asked for, including `"system"`. */
  preference: ThemePreference;
  /** What is actually on screen right now. */
  theme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** Flips between light and dark, resolving `system` to its opposite first. */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Seeded from storage so the first render already matches what the inline
  // script in index.html painted — no second repaint on mount.
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => readStored() ?? "system"
  );
  const [systemValue, setSystemValue] = useState<ResolvedTheme>(() => systemTheme());

  // Track the OS setting so `system` stays live rather than being sampled once.
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia(MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) =>
      setSystemValue(event.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const theme: ResolvedTheme = preference === "system" ? systemValue : preference;

  // The single place the DOM is mutated. `color-scheme` is set too, so native
  // controls (scrollbars, date pickers) follow the theme instead of staying
  // light against a dark page.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the theme just will not persist */
    }
  }, []);

  const toggle = useCallback(() => {
    // Resolve first: toggling from `system` must produce the *opposite* of what
    // the user is currently looking at, not a jump to light.
    setPreference(theme === "dark" ? "light" : "dark");
  }, [theme, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference, toggle }),
    [preference, theme, setPreference, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
