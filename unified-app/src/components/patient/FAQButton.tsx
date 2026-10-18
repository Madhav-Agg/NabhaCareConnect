import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Frequently asked questions, as a dialog.
 *
 * The previous version was a hand-rolled modal: an absolutely-positioned div with
 * a `bg-opacity-50` overlay. It had no `role="dialog"`, no `aria-modal`, no focus
 * trap, no Escape handler, no scroll lock and no focus restore — a keyboard user
 * could tab straight out of the "modal" and into the page behind it, and there
 * was no way to close it without clicking. It also set `aria-expanded` on the
 * trigger, which is a disclosure-pattern attribute being used to describe a
 * dialog.
 *
 * It now renders through the shared `Dialog` primitive, so all of that comes from
 * Radix, and it themes with the rest of the app. The old trigger was `bg-blue-600`
 * and the panel `bg-white` with `text-gray-900`/`border-gray-200` — a bright white
 * slab in dark mode.
 *
 * The list is not numbered any more. The `1.` prefix was being prepended to text
 * that already read as a question, and it forced the numbering to be recomputed
 * on a language change.
 */
export const FAQButton = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // The Q&A pairs live in the locale bundles under `faq.items`, so all three
  // languages stay in step and adding a fourth needs no component change.
  const faqs = t("faq.items", { returnObjects: true }) as unknown as FaqItem[];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("faq.ariaOpen")}
          // `bottom-24` clears the fixed mobile navigation bar, which the old
          // `bottom-6` did not — the help button sat on top of the tab bar.
          className="fixed bottom-24 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:bottom-6 lg:right-6"
        >
          <HelpCircle aria-hidden="true" className="h-6 w-6" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("faq.title")}</DialogTitle>
          <DialogDescription>{t("faq.description")}</DialogDescription>
        </DialogHeader>

        <div className="-mr-2 max-h-[60vh] overflow-y-auto pr-2">
          {faqs.map((faq) => (
            <section
              key={faq.question}
              className="border-b border-border py-4 first:pt-0 last:border-b-0"
            >
              <h3 className="text-base font-semibold text-foreground">{faq.question}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {faq.answer}
              </p>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
