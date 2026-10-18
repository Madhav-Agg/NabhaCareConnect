import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * The platform mark.
 *
 * A shield containing a cross. It replaces the previous wordmark, which was the
 * app name rendered through a violet→magenta gradient (`.gradient-hero`) — a
 * consumer-SaaS signal that had nothing to do with healthcare and broke
 * entirely in dark mode, because `-webkit-text-fill-color: transparent` does
 * not respond to a colour token.
 *
 * The mark is decorative here — the accessible name comes from the adjacent
 * text — so it is hidden from assistive technology.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn("h-9 w-9 shrink-0", className)}
    >
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <path
        d="M32 12c7.5 5.2 12 9.5 12 15.4C44 38 38.9 46.4 32 52c-6.9-5.6-12-14-12-24.6C20 21.5 24.5 17.2 32 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
        className="text-primary-foreground"
      />
      <path
        d="M32 25.5v13M25.5 32h13"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        className="text-primary-foreground"
      />
    </svg>
  );
}

/**
 * Mark + name, with the tagline underneath on wider screens.
 *
 * `tagline` is dropped on small screens rather than truncated: three translations
 * of a marketing line is the first thing that should go when space is tight.
 */
export function BrandLockup({
  showTagline = true,
  className,
}: {
  showTagline?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark />
      <div className="min-w-0">
        <p className="truncate text-base font-bold leading-tight tracking-tight text-foreground">
          {t("common.appName")}
        </p>
        {showTagline && (
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {t("common.tagline")}
          </p>
        )}
      </div>
    </div>
  );
}
