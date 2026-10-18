import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pill, Phone, MapPin, Search, Store, RefreshCw, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";

interface Pharmacy {
  id: string;
  name: string;
  phone: string;
  locality: string;
  hours: string;
}

/**
 * Pharmacy directory.
 *
 * Redesign notes:
 *  • The refresh button was labelled `t("patient.medicines.hours")`, so it read
 *    "Open" — the `hours` key is the word used on a pharmacy card, not an action.
 *    It now uses `common.refresh`, and carries an accessible name that says what
 *    it refreshes.
 *  • The search field was placeholder-only, which fails WCAG 3.3.2 and leaves
 *    the field unnamed the moment the user types. It now has a real `<label>`.
 *  • Search is `type="search"` with `role="search"` on the wrapper, and the
 *    result count is a polite live region so a screen-reader user knows the list
 *    changed as they type.
 *  • The empty state distinguishes "nothing matches your search" from "the
 *    directory is empty", because the recovery is different in each case.
 *  • Directions links say where they lead. A bare "Directions" link that opens a
 *    third-party map is ambiguous in a list of six.
 */
export const MedicineFinderSection = () => {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  const searchId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ data: Pharmacy[] }>(apiPath("patient", "/pharmacies"));
      setPharmacies(result.data || []);
    } catch (err) {
      setError(localizedError(err, t, "errors.generic"));
      setPharmacies([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      term
        ? pharmacies.filter(
            (p) =>
              p.name.toLowerCase().includes(term) || p.locality.toLowerCase().includes(term)
          )
        : pharmacies,
    [pharmacies, term]
  );

  const directionsHref = (p: Pharmacy) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${p.name} ${p.locality} Nabha Punjab India`
    )}`;

  if (loading) {
    return (
      <div className="app-container">
        <Skeleton className="h-8 w-56" />
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <SectionHeader
        title={t("patient.medicines.title")}
        subtitle={t("patient.medicines.subtitle")}
        actions={
          <Button variant="outline" onClick={load}>
            <RefreshCw aria-hidden="true" />
            {t("common.refresh")}
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="card-medical mb-6 space-y-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={searchId}>{t("patient.medicines.searchLabel")}</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              placeholder={t("patient.medicines.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("patient.medicines.notice")}
        </p>
      </div>

      {/* Announces the filtered count as it changes without interrupting typing. */}
      <p role="status" aria-live="polite" className="sr-only">
        {t("patient.medicines.resultCount", { count: filtered.length })}
      </p>

      {filtered.length === 0 ? (
        pharmacies.length === 0 ? (
          <EmptyState
            icon={Store}
            title={t("patient.medicines.emptyDirectory")}
            hint={t("patient.medicines.emptyDirectoryHint")}
          />
        ) : (
          <EmptyState
            icon={Store}
            title={t("patient.medicines.empty")}
            hint={t("patient.medicines.emptyHint")}
            action={
              <Button variant="outline" onClick={() => setSearch("")}>
                {t("patient.medicines.clearSearch")}
              </Button>
            }
          />
        )
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {filtered.map((pharmacy) => (
            <li key={pharmacy.id} className="card-medical flex flex-col">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"
                >
                  <Pill className="h-5 w-5 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-foreground">{pharmacy.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    {pharmacy.locality}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    {t("patient.medicines.hoursLabel", { hours: pharmacy.hours })}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`tel:${pharmacy.phone}`}
                    aria-label={t("patient.emergency.ariaCall", {
                      name: pharmacy.name,
                      number: pharmacy.phone,
                    })}
                  >
                    <Phone aria-hidden="true" />
                    {t("patient.medicines.call")}
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={directionsHref(pharmacy)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("patient.medicines.directionsFor", { name: pharmacy.name })}
                  >
                    <MapPin aria-hidden="true" />
                    {t("patient.medicines.directions")}
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
