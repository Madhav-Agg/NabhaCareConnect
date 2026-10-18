import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The shared empty state.
 *
 * The app had seven near-identical hand-rolled empty states, each with a
 * different mix of icon size, heading level and spacing — and two of them said
 * nothing more than "No data". An empty state is the highest-leverage screen in
 * a product like this: it is what a brand-new user sees first, and it is the
 * only place where the interface can explain what is supposed to be here and
 * offer the action that fills it.
 *
 * `action` is optional but strongly encouraged — if an empty state has a
 * sensible next step, it belongs here rather than leaving the user to hunt.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  /** One sentence explaining why it is empty and what will fill it. */
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-foreground">{title}</p>
      {hint && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{hint}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Loading placeholder shaped like the content that is coming.
 *
 * A skeleton that does not match the eventual layout is worse than a spinner:
 * it promises a shape and then moves everything. These callers pass the real
 * block heights.
 */
export function SkeletonBlock({
  className,
  count = 1,
}: {
  className?: string;
  count?: number;
}) {
  return (
    <div className="space-y-4" aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cn("animate-pulse rounded-lg bg-muted", className)} />
      ))}
    </div>
  );
}
