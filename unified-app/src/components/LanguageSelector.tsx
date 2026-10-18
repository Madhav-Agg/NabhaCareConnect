import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { BrandMark } from "@/components/layout/BrandLockup";
import { setLanguage, resolveLanguage, type SupportedLanguage } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/languages";
import { cn } from "@/lib/utils";

import heroImage from "@/assets/healthcare-hero.jpg";

interface LanguageSelectorProps {
  onLanguageSelect: (language: string) => void;
}

/**
 * First-run language screen.
 *
 * The only screen a user sees before they can read anything, so it is composed
 * as its own thing rather than as a variant of the app header.
 *
 * Changes from the previous version:
 *  • The wordmark used `gradient-hero` — a violet→magenta text gradient drawn
 *    with `-webkit-text-fill-color: transparent`. Text gradients cannot follow a
 *    theme token, so it also broke in dark mode, and they vanish entirely under
 *    forced-colors / high-contrast mode. Replaced with the real brand mark.
 *  • Each option is one `<button>`. Previously the options were `<Button>`
 *    elements with no handler, and the actual click target was a wrapping
 *    `<div onClick>` — so the visible control did nothing and the working target
 *    was not keyboard operable.
 *  • Selection is carried by `aria-pressed` *and* a check icon, never by colour
 *    alone.
 *  • The endonym sits above the localized name, because the one thing a user
 *    needs here is to recognise their own language on sight. Rendering every
 *    option in the language they can't read is the standard failure.
 *  • The project's existing hero photograph is now a real composition element
 *    rather than a 10%-opacity background wash. It is decorative — the same
 *    information is in the text — so it keeps `alt=""`.
 */
export default function LanguageSelector({ onLanguageSelect }: LanguageSelectorProps) {
  const { t, i18n } = useTranslation();
  const active = resolveLanguage(i18n.language);

  return (
    <div className="wash-hero min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main id="main" className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          {/* Context image for small screens, where there is no side panel.
              Fixed aspect ratio so it cannot cause a layout shift. */}
          <div className="mb-6 overflow-hidden rounded-xl lg:hidden">
            <img
              src={heroImage}
              alt=""
              width={1600}
              height={900}
              className="aspect-[16/9] w-full object-cover object-top"
            />
          </div>

          <div className="flex flex-col items-center text-center">
            <BrandMark className="h-12 w-12" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t("common.appName")}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              {t("common.tagline")}
            </p>
          </div>

          <section
            aria-labelledby="choose-language-heading"
            className="surface-float mt-8 rounded-xl p-6"
          >
            <h2 id="choose-language-heading" className="text-lg font-semibold text-foreground">
              {t("language.chooseTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground" lang="hi">
              {t("language.chooseSubtitle")}
            </p>

            <ul className="mt-5 space-y-3">
              {LANGUAGES.map((language) => {
                const isSelected = active === language.code;
                return (
                  <li key={language.code}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        // Switching re-renders this screen, so the label under
                        // the user's finger updates in place before they commit.
                        setLanguage(language.code as SupportedLanguage);
                        onLanguageSelect(language.code);
                      }}
                      className={cn(
                        "touch-target flex w-full items-center justify-between gap-4 rounded-lg border p-4 text-left transition-colors duration-150",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50 hover:bg-accent"
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span
                          className="text-lg font-semibold text-foreground"
                          lang={language.tag}
                        >
                          {language.endonym}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t(`language.${language.labelKey}`)}
                        </span>
                      </span>
                      {isSelected && (
                        <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
              {t("language.changeHint")}
            </p>
          </section>
        </div>
      </main>

      {/* Decorative side panel. No scrim, no overlay: the photograph is already
          low-contrast enough to sit beside the form without a gradient to tame
          it, and a scrim here would be decoration for its own sake. */}
      <aside aria-hidden="true" className="relative hidden lg:block">
        <img
          src={heroImage}
          alt=""
          width={1600}
          height={900}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </aside>
    </div>
  );
}
