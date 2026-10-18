import { useTranslation } from "react-i18next";
import { Stethoscope, UserRound, ArrowRight } from "lucide-react";

import { AppHeader } from "@/components/layout/AppHeader";

interface PanelSelectorProps {
  onPanelSelect: (panel: "doctor" | "patient") => void;
  language?: string;
}

const PANELS = [
  {
    id: "doctor" as const,
    icon: Stethoscope,
    titleKey: "panel.doctor.title",
    descriptionKey: "panel.doctor.description",
    ctaKey: "panel.doctor.cta",
    noteKey: "panel.doctor.note",
  },
  {
    id: "patient" as const,
    icon: UserRound,
    titleKey: "panel.patient.title",
    descriptionKey: "panel.patient.description",
    ctaKey: "panel.patient.cta",
    noteKey: null,
  },
];

/**
 * Panel chooser — the screen between language selection and sign-in.
 *
 * The previous version was a grid of `<div role="group" onClick>` cards, each
 * containing a `<Button>` with no handler. That is the worst of both worlds: the
 * element that looks like the control (the button) did nothing, and the element
 * that actually worked (the div) could not be reached by keyboard, announced no
 * role, and gave no feedback. `role="group"` compounded it — it tells assistive
 * technology the container is a related set of form fields, which it is not.
 *
 * Each panel is now a heading, a description, and one full-width `<button>`.
 * The heading is a real `<h2>` outside the button, which keeps the document
 * outline navigable (`H` in a screen reader jumps between the two panels) and
 * keeps the markup valid — a heading inside a button is not permitted.
 */
export default function PanelSelector({ onPanelSelect }: PanelSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />

      <main id="main" className="flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="app-container">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="heading-page">{t("panel.selectTitle")}</h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              {t("panel.selectSubtitle")}
            </p>
          </div>

          <ul className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
            {PANELS.map((panel) => {
              const Icon = panel.icon;
              return (
                <li
                  key={panel.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-6"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <Icon className="h-6 w-6" />
                  </span>

                  <h2 className="mt-4 text-lg font-semibold text-foreground">
                    {t(panel.titleKey)}
                  </h2>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {t(panel.descriptionKey)}
                  </p>

                  <button
                    type="button"
                    data-panel={panel.id}
                    onClick={() => onPanelSelect(panel.id)}
                    className="touch-target mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                  >
                    {t(panel.ctaKey)}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>

                  {/* Rendered for every panel, even when there is nothing to say.
                      The two cards sit side by side and stretch to a shared
                      height, so a note on only one of them pushed that card's
                      CTA up by the note's height — the two primary buttons
                      landed 32px apart on the one screen whose entire job is to
                      offer two equivalent choices. Reserving the slot keeps them
                      on the same line. On the single-column mobile layout the
                      reserve is invisible either way. */}
                  <p className="mt-3 min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
                    {panel.noteKey ? t(panel.noteKey) : null}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}
