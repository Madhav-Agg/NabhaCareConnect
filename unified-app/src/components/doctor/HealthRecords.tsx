import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  UserRound,
  FileText,
  Plus,
  Phone,
  Stethoscope,
  Activity,
  Pill,
  Heart,
  RefreshCw,
  CalendarDays,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { useToast } from "@/hooks/use-toast";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { formatDateLong, todayLocal } from "@/lib/format";

interface Patient {
  phone: string;
  name: string;
  age: number | null;
  address: string | null;
  lastVisit: string | null;
  appointmentCount: number;
  recordCount: number;
}

interface HealthRecord {
  id: number;
  patient_phone: string;
  doctor_name: string | null;
  date: string;
  type: string;
  title: string;
  description: string | null;
  facility: string | null;
}

const RECORD_TYPES = [
  "consultation",
  "lab",
  "xray",
  "prescription",
  "vaccination",
  "surgery",
] as const;

const ICONS: Record<string, typeof Stethoscope> = {
  consultation: Stethoscope,
  lab: Activity,
  xray: FileText,
  prescription: Pill,
  vaccination: Heart,
  surgery: Stethoscope,
};

/**
 * Doctor-facing patient records.
 *
 * Replaces three hardcoded patients (Preet Kaur, Hardeep Singh, Simran Bhatia) and
 * three hardcoded records with attachment URLs pointing at a Supabase project that
 * this app was never connected to. Everything shown now comes from the database,
 * and the upload dialog actually persists a record instead of showing a success
 * toast that did nothing.
 *
 * Redesign notes — this was the largest remaining defect cluster in the product:
 *  • **The page heading read "Title".** It rendered `doctor.records.title`, which
 *    is the label for the record-title *field*, so the screen was headed with the
 *    name of an input. The page key now says "Patient Records" and the field has
 *    its own key.
 *  • **Two detail rows were labelled with the wrong keys.** The patient's name
 *    was captioned `common.none` (an em-dash) and their age was captioned
 *    `doctor.records.date`. Both now have real labels.
 *  • **The patient card was a `<div onClick>`.** It looked clickable, was not
 *    reachable by keyboard at all, and had no role. It is now a real `<button>`
 *    inside a list item, with an explicit accessible name. The telephone link had
 *    `onClick={stopPropagation}` to stop it opening the card — that hack is gone,
 *    and the link is a sibling of the button rather than nested inside it, so
 *    neither element has to fight the other.
 *  • Roughly a dozen user-facing strings were hardcoded English while matching
 *    keys existed in all three bundles: "Refresh", "Add record", "Filing a record
 *    for…", "Date", "Title", "Notes", the notes placeholder, "Facility
 *    (optional)", "Cancel", "Save record", "Saving…", "Last visit:", and "A title
 *    is required."
 *  • Record types were rendered raw with a `capitalize` class, so a Hindi user
 *    saw "Xray" and "Lab" — the server enum leaking into the UI. They are
 *    translated, with an unrecognised type falling back to its raw value rather
 *    than to a dotted key.
 *  • The search field was placeholder-only and now has a label; the patient count
 *    is a polite live region so the result of typing is announced.
 *  • Both loaders were `useCallback(…, [])` while reading `t`, so server errors
 *    stayed in the language active at mount.
 *  • Saving a record closed the dialog in total silence. It now confirms, and a
 *    failed save leaves every field as typed.
 *  • The record-type `Select` had a visible label with no association; it now
 *    uses `aria-labelledby`.
 */
export default function HealthRecords() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: todayLocal(),
    type: "consultation",
    title: "",
    description: "",
    facility: "",
  });

  const searchId = useId();
  const typeLabelId = useId();

  const loadPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ data: Patient[] }>(apiPath("doctor", "/patients"));
      setPatients(result.data || []);
    } catch (err) {
      setError(localizedError(err, t));
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const loadRecords = useCallback(
    async (phone: string) => {
      setRecordsLoading(true);
      setRecordsError(null);
      try {
        const result = await api<{ data: HealthRecord[] }>(
          apiPath("doctor", `/records?patientPhone=${encodeURIComponent(phone)}`)
        );
        setRecords(result.data || []);
      } catch (err) {
        setRecordsError(localizedError(err, t));
        setRecords([]);
      } finally {
        setRecordsLoading(false);
      }
    },
    [t]
  );

  const filteredPatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter(
      (p) => p.name.toLowerCase().includes(term) || p.phone.includes(term)
    );
  }, [patients, search]);

  const openPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    loadRecords(patient.phone);
  };

  const closePatient = () => {
    setSelectedPatient(null);
    setRecords([]);
    setRecordsError(null);
  };

  const typeLabel = (type: string) =>
    (RECORD_TYPES as readonly string[]).includes(type)
      ? t(`doctor.records.recordTypes.${type}`)
      : type;

  const createRecord = async () => {
    if (!selectedPatient) return;
    setFormError(null);

    if (!form.title.trim()) {
      setFormError(t("doctor.records.titleRequired"));
      return;
    }

    setSaving(true);
    try {
      await api(apiPath("doctor", "/records"), {
        method: "POST",
        body: {
          patientPhone: selectedPatient.phone,
          date: form.date,
          type: form.type,
          title: form.title.trim(),
          description: form.description.trim() || null,
          facility: form.facility.trim() || null,
        },
      });

      setForm({ date: todayLocal(), type: "consultation", title: "", description: "", facility: "" });
      setShowCreate(false);
      await Promise.all([loadRecords(selectedPatient.phone), loadPatients()]);
      toast({ title: t("doctor.records.recordSaved"), variant: "success" });
    } catch (err) {
      // The form keeps everything the doctor typed; only the failed save is
      // reported, so correcting one field does not mean re-entering the record.
      setFormError(localizedError(err, t));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title={t("doctor.records.title")}
        subtitle={t("doctor.records.subtitle")}
        actions={
          <Button variant="outline" onClick={loadPatients}>
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

      <div className="card-medical mb-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor={searchId}>{t("doctor.records.searchLabel")}</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              placeholder={t("doctor.records.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-foreground">
          {t("doctor.records.patientsCount", { count: filteredPatients.length })}
        </h3>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {t("doctor.records.patientsCount", { count: filteredPatients.length })}
      </p>

      {filteredPatients.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={t("doctor.records.noPatientsFound")}
          hint={
            search ? t("doctor.records.adjustSearch") : t("doctor.records.noPatientsYet")
          }
          action={
            search ? (
              <Button variant="outline" onClick={() => setSearch("")}>
                {t("doctor.records.clearSearch")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {filteredPatients.map((patient) => (
            <li key={patient.phone} className="card-medical">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => openPatient(patient)}
                  aria-label={t("doctor.records.ariaOpenPatient", { name: patient.name })}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <UserRound className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">
                      {patient.name}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      {patient.age != null && (
                        <span>{t("patient.profile.years", { age: patient.age })}</span>
                      )}
                      <span>
                        {patient.lastVisit
                          ? t("doctor.records.lastVisit", {
                              date: formatDateLong(patient.lastVisit),
                            })
                          : t("doctor.records.noVisits")}
                      </span>
                    </span>
                  </span>
                </button>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <a
                    href={`tel:${patient.phone}`}
                    aria-label={t("doctor.records.ariaCallPatient", {
                      name: patient.name,
                      phone: patient.phone,
                    })}
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Phone aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {patient.phone}
                  </a>
                  <Badge variant="outline" className="badge-inline">
                    {t("doctor.records.recordCount", { count: patient.recordCount })}
                  </Badge>
                  <Badge variant="secondary" className="badge-inline">
                    {t("doctor.records.visitCount", { count: patient.appointmentCount })}
                  </Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Patient detail */}
      <Dialog
        open={Boolean(selectedPatient)}
        onOpenChange={(open) => {
          if (!open) closePatient();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound aria-hidden="true" className="h-5 w-5 text-primary" />
              {t("doctor.records.detailTitle", { name: selectedPatient?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>{selectedPatient?.phone}</DialogDescription>
          </DialogHeader>

          <section aria-labelledby="patient-details-heading" className="space-y-3">
            <h3 id="patient-details-heading" className="heading-eyebrow">
              {t("doctor.records.details")}
            </h3>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t("doctor.records.name")}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {selectedPatient?.name || t("common.none")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("doctor.records.age")}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {selectedPatient?.age != null
                    ? t("patient.profile.years", { age: selectedPatient.age })
                    : t("common.none")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("doctor.phone")}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {selectedPatient?.phone || t("common.none")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("patient.profile.address")}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {selectedPatient?.address || t("common.none")}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="patient-records-heading" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="patient-records-heading" className="text-base font-semibold text-foreground">
                {t("doctor.records.recordsCount", { count: records.length })}
              </h3>
              <Button
                onClick={() => {
                  setFormError(null);
                  setShowCreate(true);
                }}
              >
                <Plus aria-hidden="true" />
                {t("doctor.records.addRecord")}
              </Button>
            </div>

            {recordsError && (
              <Alert variant="destructive">
                <AlertDescription>{recordsError}</AlertDescription>
              </Alert>
            )}

            {recordsLoading ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : records.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={t("doctor.records.noRecordsYet")}
                hint={t("doctor.records.nothingFiled")}
              />
            ) : (
              <ul className="space-y-3">
                {records.map((record) => {
                  const Icon = ICONS[record.type] || FileText;
                  return (
                    <li key={record.id} className="card-medical">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-foreground">{record.title}</h4>
                            <Badge variant="secondary" className="badge-inline">
                              {typeLabel(record.type)}
                            </Badge>
                          </div>
                          {record.description && (
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                              {record.description}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                              {formatDateLong(record.date)}
                            </span>
                            {record.doctor_name && <span>{record.doctor_name}</span>}
                            {record.facility && <span>{record.facility}</span>}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </DialogContent>
      </Dialog>

      {/* Add record */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("doctor.records.addTitle")}</DialogTitle>
            <DialogDescription>
              {t("doctor.records.addSubtitle", {
                name: selectedPatient?.name ?? "",
                phone: selectedPatient?.phone ?? "",
              })}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createRecord();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="record-date">{t("doctor.records.date")}</Label>
              <Input
                id="record-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label id={typeLabelId}>{t("doctor.records.recordType")}</Label>
              <Select
                value={form.type}
                onValueChange={(value) => setForm({ ...form, type: value })}
              >
                <SelectTrigger aria-labelledby={typeLabelId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`doctor.records.recordTypes.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="record-title">{t("doctor.records.titleLabel")}</Label>
              <Input
                id="record-title"
                placeholder={t("doctor.records.titlePlaceholder")}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={160}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="record-desc">{t("doctor.records.notes")}</Label>
              <Textarea
                id="record-desc"
                rows={4}
                placeholder={t("doctor.records.notesPlaceholder")}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={2000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="record-facility">{t("doctor.records.facility")}</Label>
              <Input
                id="record-facility"
                placeholder={t("doctor.records.facilityPlaceholder")}
                value={form.facility}
                onChange={(e) => setForm({ ...form, facility: e.target.value })}
                maxLength={160}
              />
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving} aria-busy={saving}>
                {saving && <CheckCircle2 aria-hidden="true" className="animate-pulse" />}
                {saving ? t("doctor.records.saving") : t("doctor.records.saveRecord")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
