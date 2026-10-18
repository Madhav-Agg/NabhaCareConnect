/**
 * Keeps the document in sync with the active language.
 *
 * `<html lang>` drives screen-reader pronunciation, browser font fallbacks and
 * `Intl` defaults. Without it, a Punjabi or Hindi page is announced with English
 * phonetics, which makes the screen reader unusable for the target audience.
 *
 * Importing this module subscribes to language changes; there is no manual call
 * site to forget.
 */

import i18n from "./i18n";

const LOCALE_TO_HTML_LANG: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  pa: "pa-IN",
};

function applyDocumentLanguage(lng: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = LOCALE_TO_HTML_LANG[lng] ?? "en-IN";
  document.documentElement.dir = "ltr"; // all three scripts are left-to-right
}

applyDocumentLanguage(i18n.language);
i18n.on("languageChanged", applyDocumentLanguage);

export default applyDocumentLanguage;