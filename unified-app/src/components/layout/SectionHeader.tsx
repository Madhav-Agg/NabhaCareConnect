import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The heading block that opens every section.
 *
 * Extracted because the app had eleven copies of the same three-element block
 * (`<h1 text-3xl font-bold>` + `<p text-muted-foreground>` + centred wrapper),
 * each with slightly different sizes and margins — which is exactly how a
 * product stops looking designed. One component means one type scale.
 *
 * The heading is an `<h2>`: `PatientPanel`/`DoctorDashboard` render the page's
 * single `<h1>`, so each section is a subsection of it. That keeps the document
 * outline navigable, which matters on the longer forms.
 *
 * `actions` is placed on the same row on desktop and stacked below the heading on
 * mobile, where a side-by-side layout would squeeze the title into two words per
 * line in Hindi and Punjabi.
 */
export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
