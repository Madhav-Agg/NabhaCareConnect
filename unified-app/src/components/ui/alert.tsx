import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Alert.
 *
 * The default variant sat on `bg-background`, which made it invisible when
 * placed inside a card (both surfaces were the same colour) — so the app's own
 * warnings looked like plain paragraphs. It now sits on `bg-card` with an
 * explicit border.
 *
 * The destructive variant is tinted rather than outlined-only, so severity reads
 * at a glance without relying on the icon. `role="alert"` is retained: it is an
 * assertive live region, which is correct for the two uses in this app (a
 * failed sign-in, and the emergency banner).
 *
 * Bodies get `leading-relaxed` — these carry clinical instructions and the
 * default leading is too tight for Devanagari and Gurmukhi.
 */
const alertVariants = cva(
  "relative w-full rounded-lg border p-4 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground [&>svg]:text-muted-foreground",
        warning:
          "border-warning bg-warning text-warning-foreground [&>svg]:text-warning-foreground",
        destructive:
          "border-destructive/40 bg-destructive/10 text-destructive-foreground [&>svg]:text-destructive",
        success:
          "border-success/40 bg-success/10 text-foreground [&>svg]:text-success",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-semibold leading-snug tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm leading-relaxed [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
