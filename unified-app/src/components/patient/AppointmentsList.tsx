import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarX2,
  Clock,
  Stethoscope,
  Trash2,
  RefreshCw,
  CalendarPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { useSectionNav } from "@/lib/panelNavigation";
import {
  appointmentStatus,
  formatDateLong,
  formatTime12,
  todayLocal,
} from "@/lib/format";

interface Appointment {
  id: number;
  doctor_name: string;
  specialty: string | null;
  date: string;
  time: string;
  consultation_type: string;
  description: string | null;
  status: "scheduled" | "completed" | "cancelled";
}

/** Consultation types are a fixed server enum; map them, never render them raw. */
const TYPE_KEYS: Record<string, string> = {
  video: "video",
  phone: "phone",
  "in-person": "in-person",
};

/**
 * The patient's own appointments.
 *
 * Redesign notes:
 *  • `window.confirm` is gone — see `ConfirmDialog` for why that mattered. The
 *    cancellation now shows which appointment is being cancelled and reports
 *    failure inline instead of appearing to do nothing.
 *  • The list is grouped into Today / Upcoming / Past using the three headings
 *    that already existed in the bundle but were never rendered, so a patient
 *    with a long history can see what is next without reading every card. The
 *    groups use `<section>` + `<h3>`, which also makes them navigable by heading.
 *  • The consultation type was rendered raw with a `capitalize` class, so users
 *    read "In-person" — the wire value — rather than a translated label.
 *  • "Refresh" was hardcoded English while `common.refresh` existed.
 *  • Cancel is no longer shown for an appointment the server will refuse to
 *    cancel (completed or already cancelled), which removes a button whose only
 *    outcome was an error message.
 *  • `load` is memoised on `t`: it was `useCallback(…, [])` while reading `t`, so
 *    a server error stayed in the language that was active at mount.
 */
export const AppointmentsList = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Appointment | null>(null);
  const { t } = useTranslation();
  const goTo = useSectionNav();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ data: Appointment[] }>(apiPath("patient", "/appointments"));
      setAppointments(result.data || []);
    } catch (err) {
      setError(localizedError(err, t));
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmCancel = async () => {
    if (!pendingCancel) return;
    const id = pendingCancel.id;
    setBusyId(id);
    setError(null);
    try {
      await api(apiPath("patient", `/appointments/${id}`), {
        method: "PATCH",
        body: { status: "cancelled" },
      });
      setPendingCancel(null);
      await load();
    } catch (err) {
      setError(localizedError(err, t));
    } finally {
      setBusyId(null);
    }
  };

  const statusLabel = (status: Appointment["status"]) =>
    status === "scheduled"
      ? t("patient.appointments.statusScheduled")
      : status === "completed"
        ? t("patient.appointments.statusCompleted")
        : t("patient.appointments.statusCancelled");

  const typeLabel = (type: string) =>
    TYPE_KEYS[type] ? t(`patient.booking.types.${TYPE_KEYS[type]}`) : type;

  const groups = useMemo(() => {
    const today: Appointment[] = [];
    const upcoming: Appointment[] = [];
    const past: Appointment[] = [];
    const cancelled: Appointment[] = [];

    for (const appointment of appointments) {
      // Status is checked before the date. Bucketing on the date alone put a
      // *cancelled* appointment whose old slot is still in the future under
      // "Upcoming", so the card told the patient they had an upcoming visit
      // while its own badge said "Cancelled". A cancelled slot never happens,
      // so it is grouped on its own whatever the date says.
      if (appointment.status === "cancelled") {
        cancelled.push(appointment);
        continue;
      }

      const bucket = appointmentStatus(appointment.date, appointment.time);
      if (bucket === "today") today.push(appointment);
      else if (bucket === "upcoming") upcoming.push(appointment);
      else past.push(appointment);
    }

    // Soonest first within each group; the past group is also useful in
    // chronological order, so it is sorted the same way.
    const byDate = (a: Appointment, b: Appointment) =>
      `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
    today.sort(byDate);
    upcoming.sort(byDate);
    past.sort(byDate);
    cancelled.sort(byDate);

    return [
      { id: "today", labelKey: "today", items: today },
      { id: "upcoming", labelKey: "upcoming", items: upcoming },
      { id: "past", labelKey: "past", items: past },
      // Reuses the status wording: the heading and the badge on the card below
      // it say exactly the same thing, so a second key would only be a place
      // for them to drift apart.
      { id: "cancelled", labelKey: "statusCancelled", items: cancelled },
    ].filter((group) => group.items.length > 0);
  }, [appointments]);

  if (loading) {
    return (
      <div className="app-container-narrow">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const renderCard = (appointment: Appointment) => {
    const when = appointmentStatus(appointment.date, appointment.time);
    const isToday = appointment.date === todayLocal();
    const cancellable = appointment.status === "scheduled";

    return (
      <li
        key={appointment.id}
        className={
          "card-medical " + (cancellable && isToday ? "border-primary/50" : "")
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Stethoscope aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
              <h4 className="font-semibold text-foreground">{appointment.doctor_name}</h4>
              {appointment.specialty && (
                <span className="text-sm text-muted-foreground">· {appointment.specialty}</span>
              )}
            </div>

            <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">{t("patient.records.date")}</dt>
                <CalendarX2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                <dd>{formatDateLong(appointment.date)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">{t("patient.booking.time")}</dt>
                <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
                <dd>{formatTime12(appointment.time)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">{t("patient.booking.type")}</dt>
                <dd>{typeLabel(appointment.consultation_type)}</dd>
              </div>
            </dl>

            {appointment.description && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {appointment.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={
                when === "today" && cancellable
                  ? "status-next"
                  : appointment.status === "scheduled"
                    ? "status-pending"
                    : appointment.status === "completed"
                      ? "status-waiting"
                      : "status-pending"
              }
            >
              {statusLabel(appointment.status)}
            </span>

            {cancellable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingCancel(appointment)}
                disabled={busyId === appointment.id}
                aria-busy={busyId === appointment.id}
                aria-label={t("patient.appointments.cancelNamed", {
                  doctor: appointment.doctor_name,
                  date: formatDateLong(appointment.date),
                })}
              >
                <Trash2 aria-hidden="true" />
                {t("patient.appointments.cancel")}
              </Button>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="app-container-narrow">
      <SectionHeader
        title={t("patient.appointments.title")}
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

      {appointments.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title={t("patient.appointments.empty")}
          hint={t("patient.appointments.emptyHint")}
          action={
            goTo ? (
              <Button variant="outline" onClick={() => goTo("appointments")}>
                <CalendarPlus aria-hidden="true" />
                {t("patientNav.book")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`appointments-${group.id}`}>
              <h3
                id={`appointments-${group.id}`}
                className="heading-eyebrow mb-3"
              >
                {t(`patient.appointments.${group.labelKey}`)}
              </h3>
              <ul className="space-y-3">{group.items.map(renderCard)}</ul>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingCancel)}
        onOpenChange={(open) => !open && setPendingCancel(null)}
        title={t("patient.appointments.cancelTitle")}
        description={t("patient.appointments.cancelBody", {
          doctor: pendingCancel?.doctor_name ?? "",
          date: formatDateLong(pendingCancel?.date),
        })}
        confirmLabel={t("patient.appointments.cancelConfirmAction")}
        cancelLabel={t("patient.appointments.cancelKeep")}
        onConfirm={confirmCancel}
        pending={busyId !== null}
      />
    </div>
  );
};
