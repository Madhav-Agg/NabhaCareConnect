import type { ReactNode } from "react";

import { BrandLockup } from "./BrandLockup";
import { LanguageMenu } from "./LanguageMenu";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

/**
 * The persistent trust line.
 *
 * Every screen — the first-run language picker, the panel chooser, sign-in, the
 * patient panel, the doctor dashboard — sits under this one header. That is the
 * single structural decision that makes the product feel like one place rather
 * than five unrelated screens, and it is what makes the identity survive a
 * navigation. Dark mode, language and account controls live here once instead of
 * being reinvented per screen.
 *
 * Deliberately contains no `<nav>`: the header is chrome, and the primary
 * navigation belongs to the section that owns it. Nesting the two produced the
 * duplicate landmark that made screen-reader navigation ambiguous.
 */
export function AppHeader({
  children,
  className,
}: {
  /** Account controls, a back button, or anything screen-specific. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        // Solid, not translucent: `backdrop-blur` over content that is about to
        // be read is a legibility cost with no benefit here, and it is one of
        // the effects this design direction rules out.
        "sticky top-0 z-40 border-b border-border bg-card",
        className
      )}
    >
      <div className="app-container flex h-16 items-center justify-between gap-3">
        <BrandLockup />
        <div className="flex shrink-0 items-center gap-1">
          <LanguageMenu />
          <ThemeToggle />
          {children}
        </div>
      </div>

      {/* The brand rule. Two pixels of teal fading out to the right — the one
          piece of pure identity in the app, and the reason the header reads as
          designed rather than as a default toolbar. */}
      <div aria-hidden="true" className="rule-brand h-0.5 w-full" />
    </header>
  );
}
