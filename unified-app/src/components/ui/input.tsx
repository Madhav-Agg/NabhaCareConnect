import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Text input.
 *
 * `h-10` → `h-11` (44px) on touch screens. The previous 40px was passable for a
 * mouse and marginal for the older, less steady hands this product is largely
 * used by; fields are also the control most likely to be tapped in a hurry.
 *
 * `text-base md:text-sm` is retained deliberately: a font size below 16px on a
 * mobile input makes iOS Safari zoom the whole page when the field is focused,
 * which loses the user's place in the form.
 *
 * `aria-invalid` styling is added so a field flagged invalid by the caller looks
 * invalid as well as being announced as invalid — colour plus `aria-invalid`,
 * never colour alone.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30 md:h-10 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
