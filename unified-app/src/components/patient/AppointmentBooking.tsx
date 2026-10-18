import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, CheckCircle2, UserRound, Video, PhoneCall, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { useAuth } from "@/lib/auth";
import { toLocalDateString, startOfToday } from "@/lib/format";

interface Doctor {
  phone: string;
  name: string;
  specialty: string | null;
  room: string | null;
}

/**
 * Consultation types come from the bundle. The previous version kept a
 * hardcoded English array *while* `patient.booking.types.*` already existed in
 * all three bundles — the classic "the translations are there, the code ignores
 * them" defect, and it meant the three type buttons were the only English left
 * on an otherwise Hindi form.
 */
const CONSULTATION_TYPES: { value: string; labelKey: string; icon: typeof Video }[] = [
  { value: "video", labelKey: "video", icon: Video },
  { value: "phone", labelKey: "phone", icon: PhoneCall },
  { value: "in-person", labelKey: "in-person", icon: Building2 },
];

/** Clinic hours 09:00–17:00 in 30-minute steps. */
const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const total = 9 * 60 + i * 30;
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
});

/**
 * Appointment booking.
 *
 * Redesign notes:
 *  • Every field now has a visible, programmatically-associated label. The two
 *    Radix `Select` triggers had a visible `<Label>` next to them but no
 *    association at all, so a screen reader announced "combobox" with no name.
 *    They now use `aria-labelledby`.
 *  • The submit button was `disabled={!canSubmit}`, i.e. disabled until every
 *    field was filled. A button that is disabled for reasons the user cannot see
 *    is one of the most common form dead-ends; the button is now always
 *    actionable and the existing `patient.booking.pickAll` message explains what
 *    is missing. It is disabled only while a request is in flight, which
 *    prevents the duplicate submission the old code also allowed.
 *  • The reason field was a raw `<textarea>` with a hand-written class list that
 *    duplicated the `Textarea` primitive minus its focus ring offset. It uses
 *    the primitive.
 *  • "Booking as …" was hardcoded English; `patient.booking.bookingAs` existed
 *    in the bundle. Same for the three consultation type labels.
 *  • The date field has a hint that states the actual constraint (`min` is
 *    today), and the time field states the real opening hours the slot list is
 *    generated from — both derived from the code, neither invented.
 *  • Errors and success use `role="alert"` through the Alert primitive, so the
 *    outcome is announced without the user having to hunt for it.
 */
export const AppointmentBooking = () => {
  const { user } = useAuth();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [doctorsError, setDoctorsError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [consultationType, setConsultationType] = useState("");
  const [doctorPhone, setDoctorPhone] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { t } = useTranslation();

  const doctorLabelId = useId();
  const timeLabelId = useId();
  const typeLabelId = useId();

  const loadDoctors = useCallback(async () => {
    setLoadingDoctors(true);
    setDoctorsError(null);
    try {
      const result = await api<{ data: Doctor[] }>(apiPath("patient", "/appointments/doctors"));
      setDoctors(result.data || []);
      if (result.data?.length) setDoctorPhone((prev) => prev || result.data[0].phone);
    } catch (err) {
      setDoctorsError(localizedError(err, t));
    } finally {
      setLoadingDoctors(false);
    }
    // `t` is a dependency: it is used above, and omitting it left the error
    // message stuck in whichever language was active on first mount.
  }, [t]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const minDate = toLocalDateString(startOfToday());

  const submit = async () => {
    setError(null);
    setSuccess(null);

    if (!doctorPhone || !date || !time || !consultationType) {
      setError(t("patient.booking.pickAll"));
      return;
    }

    setSaving(true);
    try {
      await api(apiPath("patient", "/appointments"), {
        method: "POST",
        body: {
          doctorPhone,
          date,
          time,
          consultationType,
          description: description.trim() || null,
          patientName: user?.name || null,
          patientAge: user?.age ?? null,
        },
      });
      setSuccess(t("patient.booking.success"));
      setDate("");
      setTime("");
      setConsultationType("");
      setDescription("");
    } catch (err) {
      // Nothing typed is cleared on failure — the user keeps their input and
      // only has to correct the part the server objected to.
      setError(localizedError(err, t));
    } finally {
      setSaving(false);
    }
  };

  if (loadingDoctors) {
    return (
      <div className="app-container-narrow">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-6 h-[28rem] w-full" />
      </div>
    );
  }

  return (
    <div className="app-container-narrow">
      <SectionHeader
        title={t("patient.booking.title")}
        subtitle={t("patient.booking.subtitle")}
      />

      {doctorsError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{doctorsError}</AlertDescription>
        </Alert>
      )}

      {doctors.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={t("patient.booking.noDoctors")}
          action={
            <Button variant="outline" onClick={loadDoctors}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : (
        <form
          className="card-medical space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="text-sm text-muted-foreground">{t("patient.booking.allRequired")}</p>

          <div className="space-y-2">
            <Label id={doctorLabelId}>{t("patient.booking.doctor")}</Label>
            <Select value={doctorPhone} onValueChange={setDoctorPhone}>
              <SelectTrigger aria-labelledby={doctorLabelId}>
                <SelectValue placeholder={t("patient.booking.doctor")} />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((doctor) => (
                  <SelectItem key={doctor.phone} value={doctor.phone}>
                    {doctor.specialty ? `${doctor.name} — ${doctor.specialty}` : doctor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="appt-date">{t("patient.booking.date")}</Label>
              <Input
                id="appt-date"
                type="date"
                min={minDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-describedby="appt-date-hint"
                required
              />
              <p id="appt-date-hint" className="text-xs leading-relaxed text-muted-foreground">
                {t("patient.booking.dateHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label id={timeLabelId}>{t("patient.booking.time")}</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger aria-labelledby={timeLabelId} aria-describedby="appt-time-hint">
                  <SelectValue placeholder={t("patient.booking.time")} />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="appt-time-hint" className="text-xs leading-relaxed text-muted-foreground">
                {t("patient.booking.timeHint")}
              </p>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend id={typeLabelId} className="mb-2 text-sm font-medium text-foreground">
              {t("patient.booking.type")}
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {CONSULTATION_TYPES.map((type) => {
                const Icon = type.icon;
                const active = consultationType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setConsultationType(type.value)}
                    className={
                      "touch-target flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors duration-150 " +
                      (active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground")
                    }
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span className="chip-label">{t(`patient.booking.types.${type.labelKey}`)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="appt-reason">{t("patient.booking.reasonOptional")}</Label>
            <Textarea
              id="appt-reason"
              rows={3}
              placeholder={t("patient.booking.reasonPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert variant="success">
              <CheckCircle2 aria-hidden="true" />
              <AlertDescription className="font-medium">{success}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={saving} aria-busy={saving}>
            <Clock aria-hidden="true" />
            {saving ? t("patient.booking.submitting") : t("patient.booking.submit")}
          </Button>

          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
            {t("patient.booking.bookingAs", { name: user?.name || user?.phone || "" })}
          </p>
        </form>
      )}
    </div>
  );
};
