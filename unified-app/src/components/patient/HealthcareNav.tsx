import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Phone,
  Calendar,
  CalendarCheck,
  FileText,
  Pill,
  Heart,
  Home,
  Shield,
  User,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PatientSection } from "@/components/PatientPanel";
import { cn } from "@/lib/utils";

interface NavItem {
  /** Section id used by PatientPanel's switch. Kept separate from `labelKey`
   *  because the two have diverged before: the section is `appointments` while
   *  the label key is `book`. Deriving one from the other silently rendered the
   *  nav tile in English for Hindi and Punjabi users. */
  key: PatientSection;
  /** Key under `patientNav.*` in the locale bundles. */
  labelKey: string;
  icon: LucideIcon;
  /**
   * Shown in the mobile bottom bar. The other items live behind "More".
   * These five are the journeys a patient opens the app to complete; the rest
   * are reference material they reach for occasionally.
   */
  primary: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: "consult", labelKey: "consult", icon: Phone, primary: true },
  { key: "appointments", labelKey: "book", icon: Calendar, primary: true },
  { key: "myAppointments", labelKey: "myVisits", icon: CalendarCheck, primary: true },
  { key: "records", labelKey: "records", icon: FileText, primary: true },
  { key: "medicines", labelKey: "medicines", icon: Pill, primary: false },
  { key: "symptoms", labelKey: "symptoms", icon: Heart, primary: false },
  { key: "remedies", labelKey: "remedies", icon: Home, primary: false },
  { key: "emergency", labelKey: "emergency", icon: Shield, primary: false },
];

const PROFILE_ITEM: NavItem = {
  key: "profile",
  labelKey: "profile",
  icon: User,
  primary: false,
};

interface HealthcareNavProps {
  onNavigate: (section: string) => void;
  currentSection: string;
  language?: string;
}

/**
 * Patient navigation.
 *
 * One set of destinations, presented two ways:
 *
 *  • Desktop (`lg` and up) — a wrapping grid of tiles under the header. Every
 *    destination is visible, which is right when there is room for it.
 *  • Mobile — a fixed bottom bar holding the five primary journeys plus "More",
 *    which opens a sheet with all nine. The previous version stacked all eight
 *    tiles into a four-row grid at the top of every page, pushing the actual
 *    content below the fold on a 360px phone; and the top of the screen is the
 *    worst place for a primary control on a device held one-handed.
 *
 * Both presentations are the same `<nav>` model with the same state, so nothing
 * about the routing changes. `data-nav-item` is emitted by both so automation
 * does not have to care which one is on screen.
 *
 * The "More" trigger sets `aria-expanded` and the sheet is a Radix Dialog, so it
 * traps focus, closes on Escape, and returns focus to the trigger — none of
 * which the previous navigation did for its overlays.
 */
export const HealthcareNav = ({ onNavigate, currentSection }: HealthcareNavProps) => {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  const go = (section: string) => {
    onNavigate(section);
    setMoreOpen(false);
  };

  const isActive = (item: NavItem) => currentSection === item.key;
  // "More" is current when the active section is not one of the four tiles
  // visible in the bar — otherwise the bar would show nothing as current while
  // the user is on, say, Home Remedies.
  const moreIsCurrent =
    currentSection === "profile" ||
    NAV_ITEMS.filter((i) => !i.primary).some((i) => i.key === currentSection);

  return (
    <>
      {/* ── Desktop ──────────────────────────────────────────────────────── */}
      <nav aria-label={t("patientNav.sectionsLabel")} data-nav="desktop" className="hidden border-b border-border bg-card lg:block">
        <div className="app-container">
          <ul className="flex flex-wrap gap-1 py-2">
            {[...NAV_ITEMS, PROFILE_ITEM].map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    data-nav-item={item.key}
                    aria-current={active ? "page" : undefined}
                    onClick={() => go(item.key)}
                    className={cn(
                      "touch-target inline-flex flex-col items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-center transition-colors duration-150",
                      "min-w-[5.5rem]",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                    <span className="tile-label text-xs font-medium">
                      {t(`patientNav.${item.labelKey}`)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* ── Mobile ───────────────────────────────────────────────────────── */}
      <nav
        aria-label={t("patientNav.sectionsLabel")}
        data-nav="mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.filter((item) => item.primary).map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  data-nav-item={item.key}
                  aria-current={active ? "page" : undefined}
                  onClick={() => go(item.key)}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-center transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {/* The active tile is marked by a bar as well as by colour, so
                      the state is not conveyed by hue alone. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-0.5 w-8 rounded-full transition-colors",
                      active ? "bg-primary" : "bg-transparent"
                    )}
                  />
                  <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="tile-label max-w-full text-[0.6875rem] font-medium leading-tight">
                    {t(`patientNav.${item.labelKey}`)}
                  </span>
                </button>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={cn(
                "flex w-full flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-center transition-colors",
                moreIsCurrent ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-0.5 w-8 rounded-full transition-colors",
                  moreIsCurrent ? "bg-primary" : "bg-transparent"
                )}
              />
              <MoreHorizontal aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className="text-[0.6875rem] font-medium leading-tight">
                {t("patientNav.more")}
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-8">
          <SheetHeader className="text-left">
            <SheetTitle>{t("patientNav.moreTitle")}</SheetTitle>
            <SheetDescription>{t("patientNav.moreHint")}</SheetDescription>
          </SheetHeader>

          <ul className="mt-5 grid grid-cols-2 gap-3">
            {[...NAV_ITEMS.filter((item) => !item.primary), PROFILE_ITEM].map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    data-nav-item={item.key}
                    aria-current={active ? "page" : undefined}
                    onClick={() => go(item.key)}
                    className={cn(
                      "touch-target flex w-full items-center gap-3 rounded-lg border p-3.5 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn("h-5 w-5 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                    />
                    <span className="tile-label text-sm font-medium">
                      {t(`patientNav.${item.labelKey}`)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
};
