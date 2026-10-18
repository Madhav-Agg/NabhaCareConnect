import { useTranslation } from "react-i18next";
import { Check, Languages } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLanguage, resolveLanguage, type SupportedLanguage } from "@/lib/i18n";
import { LANGUAGES, languageOption } from "@/lib/languages";
import { cn } from "@/lib/utils";

/**
 * Compact language switcher for the app header.
 *
 * Difference from `LanguageSelector`, which is the full-screen first-run screen:
 * that one shows large, unmistakable buttons because it is the very first thing
 * a user sees and the whole point of the screen. This one is a control that must
 * stay out of the way on every subsequent page, so it is a menu.
 *
 * Each item shows the language in its own script *and* localized, so a user who
 * cannot read the current interface can still find their own language. The
 * common mistake is to render every option in the active language, which is
 * useless precisely when it matters.
 */
export function LanguageMenu({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const active = resolveLanguage(i18n.language);
  const activeOption = languageOption(active);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "touch-target inline-flex h-10 items-center gap-2 rounded-md px-2.5",
          "text-sm font-medium text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          className
        )}
        // The button shows a globe and the active language's endonym, which is
        // not necessarily readable to the person using it — so the name is set
        // explicitly rather than left to the visible content.
        aria-label={t("language.changeLabel", { language: activeOption?.endonym ?? active })}
      >
        <Languages aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="hidden max-w-[6rem] truncate sm:inline" lang={activeOption?.tag}>
          {activeOption?.endonym}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[13rem]">
        <DropdownMenuLabel className="heading-eyebrow">
          {t("language.chooseTitle")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((language) => {
          const isActive = language.code === active;
          return (
            <DropdownMenuItem
              key={language.code}
              onSelect={() => setLanguage(language.code as SupportedLanguage)}
              // `lang` on each item so a screen reader pronounces the endonym in
              // the right voice rather than reading Gurmukhi with English rules.
              lang={language.tag}
              className="flex cursor-pointer items-center justify-between gap-4 py-2.5"
            >
              <span className="flex flex-col">
                <span className="font-medium">{language.endonym}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`language.${language.labelKey}`)}
                </span>
              </span>
              {isActive && (
                <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
              )}
              {isActive && <span className="sr-only">{t("language.current")}</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
