import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import hi from "@/locales/hi.json";
import pa from "@/locales/pa.json";

/**
 * Localization runtime.
 *
 * Resource files live in `src/locales/<lng>.json` and are bundled at build time,
 * so there is no runtime fetch and no flash of untranslated text.
 *
 * English is both the default and the fallback: any key missing from `hi` or `pa`
 * renders the English string rather than a raw key such as `patient.booking.save`.
 * See `humanizeMissingKey` and `onMissingKey` below.
 */

export const SUPPORTED_LANGUAGES = ["en", "hi", "pa"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

/**
 * BCP-47 tags used for date, time and number formatting. The app language code
 * alone is not enough — `hi` would otherwise format dates as en-US on a browser
 * whose locale is en-US.
 */
const LOCALE_TAGS: Record<SupportedLanguage, string> = {
  en: "en-IN",
  hi: "hi-IN",
  pa: "pa-IN",
};

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  pa: { translation: pa },
};

export const STORAGE_KEY = "nabhacare.language";

function isSupported(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function readStoredLanguage(): SupportedLanguage | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isSupported(stored) ? stored : null;
  } catch {
    // Private browsing or storage disabled — fall back to the default.
    return null;
  }
}

/** Maps a stored value (or an unsupported value) onto a supported language. */
export function resolveLanguage(value: unknown): SupportedLanguage {
  return isSupported(value) ? value : DEFAULT_LANGUAGE;
}

/** BCP-47 tag for the active language, for Intl formatting. */
export function currentLocale(): string {
  return LOCALE_TAGS[resolveLanguage(i18n.language)];
}

/**
 * Last-resort text for a key that exists in no bundle at all.
 *
 * i18next's default is to echo the key, which puts strings like
 * `patient.booking.pickAll` on screen. Converting the final segment to words
 * keeps the page readable and never surfaces a dotted key to a user.
 */
function humanizeMissingKey(key: string, fallback?: string): string {
  if (fallback) return fallback;
  const leaf = String(key).split(".").pop() ?? String(key);
  const words = leaf
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLanguage() ?? DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },

  // A key missing from the active bundle but present in English falls back
  // automatically via fallbackLng. This covers the remaining case — a key
  // missing everywhere — so a raw key is never rendered.
  parseMissingKeyHandler: humanizeMissingKey,
});

// Registered as an event rather than an init option: it fires for every lookup,
// including nested keys resolved during render.
i18n.on("missingKey", (key: string) => {
  if (import.meta.env.DEV) {
    console.warn(`[i18n] missing translation key: ${key}`);
  }
});

// Persist the choice so it survives a refresh.
i18n.on("languageChanged", (lng) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, resolveLanguage(lng));
  } catch {
    /* storage unavailable — the language just will not persist */
  }
});

/**
 * Switches the active language. Safe to call with an unsupported value, which
 * resolves to English rather than leaving the UI on a language with no strings.
 */
export function setLanguage(lng: string): void {
  i18n.changeLanguage(resolveLanguage(lng));
}

export default i18n;