import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  Stethoscope,
  Pill,
  Activity,
  Heart,
  RefreshCw,
  Search,
  CalendarDays,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { formatDateLong } from "@/lib/format";

interface HealthRecord {
  id: number;
  date: string;
  type: string;
  title: string;
  description: string | null;
  doctor_name: string | null;
  facility: string | null;
}

const ICONS: Record<string, typeof Stethoscope> = {
  consultation: Stethoscope,
  lab: Activity,
  xray: FileText,
  prescription: Pill,
  vaccination: Heart,
  surgery: Stethoscope,
};

/**
 * Record types are a fixed server enum, but the display name is not the enum
 * value. The previous version rendered `record.type` raw through a `capitalize`
 * class, which is why users saw "Xray" and "Lab" — the wire format leaking into
 * the interface. Anything unrecognised falls back to the raw value rather than
 * to a translation key, so a new server-side type can never render as
 * `patient.records.types.newthing`.
 */
const FILTERS: { value: string; labelKey: string }[] = [
  { value: "all", labelKey: "all" },
  { value: "consultation", labelKey: "consultation" },
  { value: "lab", labelKey: "lab" },
  { value: "prescription", labelKey: "prescription" },
  { value: "vaccination", labelKey: "vaccination" },
  { value: "xray", labelKey: "xray" },
  { value: "surgery", labelKey: "surgery" },
];

const KNOWN_TYPES = new Set(FILTERS.map((f) => f.value));

/**
 * The patient's own medical history.
 *
 * Redesign notes:
 *  • The filter chips were hardcoded English ("Consultations", "Lab reports")
 *    while `patient.records.types.*` already existed in all three bundles — so a
 *    Hindi user saw seven English buttons. They now read from the bundle.
 *  • The "{n} record(s)" heading was hand-pluralised in English with a `record`s
 *    suffix. That is wrong in Hindi and Punjabi, which have their own plural
 *    forms; it uses the `patient.records.count` plural key instead.
 *  • The search field was placeholder-only. It now has a `<label>`, and the
 *    filter group is a labelled `role="group"` of toggle buttons with
 *    `aria-pressed`, so the active filter is announced.
 *  • "—" was used as the value for a missing doctor or facility. An em-dash is
 *    not a word and is not read out; `common.none` is.
 *  • The dialog's detail rows are a `<dl>` with `<dt>`/`<dd>` and an explicit
 *    heading, so the reading order is label-then-value rather than two
 *    disconnected columns.
 */
export const HealthRecords = () => {
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [selected, setSelected] = useState<HealthRecord | null>(null);
  const { t } = useTranslation();
  const searchId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ data: HealthRecord[] }>(apiPath("patient", "/records"));
      setRecords(result.data || []);
    } catch (err) {
      setError(localizedError(err, t, "errors.generic"));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (filterType !== "all" && record.type !== filterType) return false;
      if (!term) return true;
      return (
        record.title.toLowerCase().includes(term) ||
        (record.description || "").toLowerCase().includes(term) ||
        (record.doctor_name || "").toLowerCase().includes(term)
      );
    });
  }, [records, search, filterType]);

  const typeLabel = (type: string) =>
    KNOWN_TYPES.has(type) ? t(`patient.records.types.${type}`) : type;

  const value = (input: string | null | undefined) => input || t("common.none");

  if (loading) {
    return (
      <div className="app-container">
        <Skeleton className="h-8 w-56" />
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <SectionHeader
        title={t("patient.records.title")}
        subtitle={t("patient.records.subtitle")}
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

      {records.length > 0 && (
        <div className="card-medical mb-6 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={searchId}>{t("patient.records.searchLabel")}</Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={searchId}
                type="search"
                placeholder={t("patient.records.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div role="group" aria-label={t("patient.records.filterLabel")} className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const active = filterType === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilterType(filter.value)}
                  className={
                    "chip-label touch-target rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground")
                  }
                >
                  {t(`patient.records.types.${filter.labelKey}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="mb-3 text-sm font-medium text-muted-foreground" role="status" aria-live="polite">
        {t("patient.records.count", { count: filtered.length })}
      </p>

      {records.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("patient.records.empty")}
          hint={t("patient.records.emptyHint")}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("patient.records.noMatches")}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setFilterType("all");
              }}
            >
              {t("patient.records.clearFilters")}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {filtered.map((record) => {
            const Icon = ICONS[record.type] || FileText;
            return (
              <li key={record.id} className="card-medical flex flex-col">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-foreground">{record.title}</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      {formatDateLong(record.date)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="badge-inline shrink-0">
                    {typeLabel(record.type)}
                  </Badge>
                </div>

                {record.description && (
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-clamp-3">
                    {record.description}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="truncate text-sm text-muted-foreground">
                    {value(record.doctor_name)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(record)}
                    aria-label={t("patient.records.viewNamed", { title: record.title })}
                  >
                    {t("patient.records.viewRecord")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("patient.records.recordDetails")}</DialogTitle>
            <DialogDescription>{selected?.title}</DialogDescription>
          </DialogHeader>

          <dl className="space-y-4 text-sm">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">{t("patient.records.date")}</dt>
              <dd className="font-medium text-foreground">{formatDateLong(selected?.date)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">{t("patient.records.doctor")}</dt>
              <dd className="font-medium text-foreground">{value(selected?.doctor_name)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">{t("patient.records.facility")}</dt>
              <dd className="font-medium text-foreground">{value(selected?.facility)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("patient.records.notes")}</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">
                {value(selected?.description)}
              </dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
};
