import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clock, UserRound, Phone, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { appointmentStatus, formatTime12, formatDateLong } from "@/lib/format";

interface Appointment {
  id: number;
  patient_phone: string;
  patient_name: string | null;
  patient_age: number | null;
  patient_condition: string | null;
  doctor_name: string;
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
 * The doctor's live queue.
 *
 * This previously rendered four invented patients (Amarjit Kaur, Gurpreet Singh,
 * Jasbir Kaur, Mandeep Singh) held in component state, with a "call next" button
 * that reshuffled the hardcoded array. It is now backed by GET
 * /api/doctor/appointments and the status change is a real PATCH.
 *
 * Redesign notes:
 *  • "Refresh" and "History" were hardcoded English while `common.refresh` and
 *    `doctor.history` existed in the bundle.
 *  • The patient's age was rendered as `(42y)` — an abbreviation that is not a
 *    word, in a UI that is translated into two languages that do not use it. It
 *    uses the same `{{age}} years` string as the patient's own profile.
 *  • The consultation type was `capitalize`d raw, so a Hindi user read
 *    "In-person" — the wire value. It is translated.
 *  • `load` was `useCallback(…, [])` while reading `t`, so an error message
 *    stayed in the language that was active when the tab first rendered.
 *  • The patient's phone number was a bare link reading "9876500101" with no
 *    accessible name. It now announces whose number it is — which matters when
 *    several patients are on screen.
 *  • The empty state explains what will appear here instead of a single "No
 *    appointments scheduled" line floating on a card.
 *  • The loading state has `aria-busy` and a live region so the queue's arrival
 *    is announced rather than silently replacing a skeleton.
 *
 * Patient name and number are shown because this is the doctor's own clinical
 * queue and they are needed to identify the person in front of them. They appear
 * nowhere else in the doctor's UI.
 */
export default function AppointmentQueue() {
  const { t } = useTranslation();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ data: Appointment[] }>(apiPath("doctor", "/appointments"));
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

  const setStatus = async (id: number, status: Appointment["status"]) => {
    setUpdatingId(id);
    setError(null);
    try {
      await api(apiPath("doctor", `/appointments/${id}`), { method: "PATCH", body: { status } });
      await load();
    } catch (err) {
      setError(localizedError(err, t));
    } finally {
      setUpdatingId(null);
    }
  };

  const scheduled = appointments.filter((a) => a.status === "scheduled");
  const past = appointments.filter((a) => a.status !== "scheduled");

  const statusLabel = (status: Appointment["status"]) =>
    status === "scheduled"
      ? t("doctor.statusScheduled")
      : status === "completed"
        ? t("doctor.statusCompleted")
        : t("doctor.statusCancelled");

  const typeLabel = (type: string) => (TYPE_KEYS[type] ? t(`patient.booking.types.${TYPE_KEYS[type]}`) : type);

  const renderRow = (appointment: Appointment) => {
    const when = appointmentStatus(appointment.date, appointment.time);
    const patientLabel = appointment.patient_name || appointment.patient_phone;

    return (
      <li
        key={appointment.id}
        className={
          "card-medical " +
          (appointment.status === "scheduled" && when === "today" ? "border-primary/50" : "")
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className={
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
                (appointment.status === "scheduled" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")
              }
            >
              <UserRound className="h-5 w-5" />
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground">{patientLabel}</h3>
                {appointment.patient_age != null && (
                  <span className="text-sm text-muted-foreground">
                    {t("patient.profile.years", { age: appointment.patient_age })}
                  </span>
                )}
                <span
                  className={
                    appointment.status === "scheduled"
                      ? when === "past"
                        ? "status-pending"
                        : "status-next"
                      : appointment.status === "completed"
                        ? "status-waiting"
                        : "status-pending"
                  }
                >
                  {statusLabel(appointment.status)}
                </span>
              </div>

              <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">{t("patient.booking.date")}</dt>
                  <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <dd>
                    {formatDateLong(appointment.date)} · {formatTime12(appointment.time)}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">{t("patient.booking.type")}</dt>
                  <dd>{typeLabel(appointment.consultation_type)}</dd>
                </div>
                {appointment.patient_condition && (
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only">{t("patient.symptoms.title")}</dt>
                    <dd>{appointment.patient_condition}</dd>
                  </div>
                )}
              </dl>

              {appointment.description && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {appointment.description}
                </p>
              )}

              {appointment.patient_phone && (
                <a
                  href={`tel:${appointment.patient_phone}`}
                  aria-label={t("doctor.records.ariaCallPatient", {
                    name: patientLabel,
                    phone: appointment.patient_phone,
                  })}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Phone aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {appointment.patient_phone}
                </a>
              )}
            </div>
          </div>

          {appointment.status === "scheduled" && (
            <Button
              onClick={() => setStatus(appointment.id, "completed")}
              disabled={updatingId === appointment.id}
              aria-busy={updatingId === appointment.id}
              className="shrink-0"
            >
              {updatingId === appointment.id ? t("doctor.saving") : t("doctor.markComplete")}
            </Button>
          )}
        </div>
      </li>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title={t("doctor.appointments")}
        actions={
          <Button variant="outline" onClick={load}>
            <RefreshCw aria-hidden="true" />
            {t("common.refresh")}
          </Button>
        }
      />

      <p className="mb-4 text-sm text-muted-foreground" role="status" aria-live="polite">
        {t("doctor.upcomingCount", { count: scheduled.length })}
      </p>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {appointments.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={t("doctor.noAppointments")}
          hint={t("doctor.noAppointmentsHint")}
        />
      ) : (
        <div className="space-y-6">
          {scheduled.length > 0 ? (
            <ul className="space-y-3">{scheduled.map(renderRow)}</ul>
          ) : (
            <EmptyState icon={CalendarDays} title={t("doctor.noAppointments")} />
          )}

          {past.length > 0 && (
            <section aria-labelledby="queue-history" className="border-t border-border pt-5">
              <h3 id="queue-history" className="heading-eyebrow mb-3">
                {t("doctor.history")}
              </h3>
              <ul className="space-y-3 opacity-80">{past.map(renderRow)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
