import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Compass, ArrowLeft } from "lucide-react";

import { AppHeader } from "@/components/layout/AppHeader";
import { BrandMark } from "@/components/layout/BrandLockup";

/**
 * 404.
 *
 * Previously hardcoded English on `bg-gray-100` with `text-blue-500`, which made
 * it the one screen in the product that ignored both the theme and the language —
 * visible in dark mode as a full-bright white page, and to a Punjabi reader as
 * English. It now uses the same header, tokens and bundles as everything else.
 *
 * The previous version also logged a `console.error` unconditionally, which the
 * E2E suite treats as a JavaScript error. A missing route is a normal user
 * mistake, not an application error, so nothing is logged.
 *
 * The back link is a router `Link`, not an `<a href="/">`: a full document
 * reload would drop the in-memory session and bounce the user to sign-in.
 */
const NotFound = () => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center"
      >
        <BrandMark className="h-12 w-12" />
        <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-primary">
          {t("notFound.code")}
        </p>
        <h1 className="heading-page mt-2">{t("notFound.title")}</h1>
        <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
          {t("notFound.body")}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/"
            className="touch-target inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t("notFound.home")}
          </Link>
          <span className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Compass aria-hidden="true" className="h-4 w-4" />
            {t("notFound.hint")}
          </span>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
