import { useTranslation } from "react-i18next";
import { LogOut, UserRound, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Account control in the header.
 *
 * The header previously had no account affordance at all: the doctor's dashboard
 * carried its own bespoke header with a hand-rolled popover (`bg-white`,
 * `text-gray-900`, no `role`, no focus management, no Escape), and the patient's
 * only way out of the session was a Logout button buried at the bottom of the
 * Profile screen. A user who is lost in a section had no consistent way to see
 * who they were signed in as or to leave.
 *
 * This is one Radix `DropdownMenu`, used by both panels. It shows the account it
 * belongs to — which is the practical defence against the classic shared-device
 * mistake of raising an alert or filing a record under the wrong person's name —
 * and it is where Logout lives for both.
 *
 * The trigger is a real `<button>` with an accessible name that includes the
 * signed-in name, so a screen-reader user does not have to open the menu to find
 * out whose session this is.
 */
export function AccountMenu({
  name,
  phone,
  onLogout,
  onProfile,
  className,
}: {
  name?: string | null;
  phone: string;
  /** Renders a Profile item when provided (the patient panel has a profile screen). */
  onProfile?: () => void;
  onLogout: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const displayName = name?.trim() || phone;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "touch-target inline-flex h-10 items-center gap-2 rounded-md px-1.5 text-muted-foreground",
          "transition-colors duration-150 hover:bg-accent hover:text-accent-foreground",
          className
        )}
        aria-label={t("account.menu", { name: displayName })}
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
        >
          {initials(displayName)}
        </span>
        <span className="hidden max-w-[8rem] truncate text-sm font-medium text-foreground sm:inline">
          {displayName}
        </span>
        <ChevronDown aria-hidden="true" className="hidden h-4 w-4 shrink-0 sm:block" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold text-foreground">
            {displayName}
          </span>
          {/* The number is the identity in this product — it is what the
              one-time code was sent to — so it is shown without the leading
              country code to stay scannable. */}
          <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
            {t("account.signedInWith", { phone })}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {onProfile && (
          <DropdownMenuItem
            onSelect={() => onProfile()}
            className="cursor-pointer gap-2 py-2.5"
          >
            <UserRound aria-hidden="true" className="h-4 w-4" />
            {t("patientNav.profile")}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onSelect={() => onLogout()}
          className="cursor-pointer gap-2 py-2.5 text-destructive focus:text-destructive"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          {t("common.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
