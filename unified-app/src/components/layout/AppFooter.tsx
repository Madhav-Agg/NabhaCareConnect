import { useTranslation } from "react-i18next";
import { Phone, ShieldAlert } from "lucide-react";

import { BrandMark } from "./BrandLockup";

/**
 * Footer.
 *
 * Contains only statements the platform can actually stand behind. No
 * certifications, no partner logos, no testimonials, no "trusted by N patients"
 * counters — none of that is verifiable from the codebase, and inventing it in a
 * healthcare product is a safety and integrity problem, not a marketing one.
 *
 * The 112 line is India's real single emergency number and is already the
 * fallback the emergency screen directs people to.
 */
export function AppFooter() {
  const { t } = useTranslation();

  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="app-container flex flex-col gap-6 py-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-md items-start gap-3">
          <BrandMark className="h-8 w-8" />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("common.appName")}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t("common.tagline")}
            </p>
          </div>
        </div>

        <div className="space-y-3 sm:max-w-sm">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
            <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            {t("footer.emergency")}
          </p>
          <a
            href="tel:112"
            className="inline-flex items-center gap-2 rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            <Phone aria-hidden="true" className="h-4 w-4" />
            {t("footer.dial112")}
          </a>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("footer.disclaimer")}
          </p>
        </div>
      </div>
    </footer>
  );
}
