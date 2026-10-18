/**
 * Language metadata.
 *
 * This module exists because the same bug shipped twice: the language *code*
 * ("pa", "hi", "en") was used to build a translation key, but the bundle keys
 * are spelled out ("punjabi", "hindi", "english"). `t(\`language.${code}\`)`
 * therefore missed, and because `parseMissingKeyHandler` in lib/i18n.ts
 * humanises a missing key rather than rendering it raw, the failure was silent —
 * the button just said "Pa" instead of "ਪੰਜਾਬੀ / Punjabi".
 *
 * Every consumer now reads `labelKey` and `endonym` from here, so a code can
 * never be mistaken for a key again. `scripts/check-label-keys.mjs` guards it.
 */

import type { SupportedLanguage } from "@/lib/i18n";

export interface LanguageOption {
  /** i18next language code. */
  code: SupportedLanguage;
  /** Key under `language.*` in the locale bundles. Never derived from `code`. */
  labelKey: string;
  /**
   * The language's name written in its own script.
   *
   * Shown alongside the localized label in the switcher. Someone who has landed
   * on a UI they cannot read needs to recognise their own language on sight, and
   * "Punjabi" in a script they do not read does not help them.
   */
  endonym: string;
  /** BCP-47 tag for `lang=` attributes on the option itself. */
  tag: string;
}

/**
 * Order is deliberate: Punjabi is first because it is the primary language of
 * the Nabha area, then Hindi, then English. The most likely choice should be
 * the easiest to reach.
 */
export const LANGUAGES: readonly LanguageOption[] = [
  { code: "pa", labelKey: "punjabi", endonym: "ਪੰਜਾਬੀ", tag: "pa-IN" },
  { code: "hi", labelKey: "hindi", endonym: "हिन्दी", tag: "hi-IN" },
  { code: "en", labelKey: "english", endonym: "English", tag: "en-IN" },
];

export function languageOption(code: string): LanguageOption | undefined {
  return LANGUAGES.find((language) => language.code === code);
}
