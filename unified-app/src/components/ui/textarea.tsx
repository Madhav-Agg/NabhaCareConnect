import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Multi-line input. Matches `Input`'s border, ring, invalid state and duration so
 * a form made of both does not look like two different products.
 *
 * `resize-y` rather than the default `resize: both`: horizontally resizable
 * textareas let a user drag the field wider than its column and push the page
 * into horizontal overflow.
 */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[88px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base leading-relaxed ring-offset-background transition-colors duration-150 placeholder:text-muted-foreground hover:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
