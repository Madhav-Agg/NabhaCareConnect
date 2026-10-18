import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Light / dark switcher.
 *
 * A real `<button>` with a real accessible name — the earlier build had no theme
 * control at all. Details that matter:
 *
 *  • The label states the *action* ("Switch to dark mode"), not the state, which
 *    is what a screen-reader user needs at the point of activation. `aria-pressed`
 *    carries the state separately.
 *  • The icon alone would be ambiguous, so the name comes from `aria-label` and
 *    the icon is `aria-hidden`.
 *  • The icon swaps rather than rotating, and the transition is opacity only —
 *    a rotation reads as a glitch on a slow device and adds nothing.
 *  • It is a 44px target, which is the practical recommendation for the older
 *    users this product serves, not merely the 24px WCAG floor.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
      title={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
      className={cn(
        "touch-target inline-flex h-10 w-10 items-center justify-center rounded-md",
        "text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <Sun
          aria-hidden="true"
          className={cn(
            "absolute h-5 w-5 transition-opacity duration-200",
            isDark ? "opacity-0" : "opacity-100"
          )}
        />
        <Moon
          aria-hidden="true"
          className={cn(
            "absolute h-5 w-5 transition-opacity duration-200",
            isDark ? "opacity-100" : "opacity-0"
          )}
        />
      </span>
    </button>
  );
}
