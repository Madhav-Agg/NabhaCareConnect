import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Siren, Flame, Wrench, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionHeader } from "@/components/layout/SectionHeader";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import type { SessionUser } from "@/lib/auth";

type EmergencyType = "codeBlue" | "codeRed" | "equipment";

interface EmergencyResult {
  alertId: number;
  smsSuccess: boolean;
  callSuccess: boolean;
  message: string;
  warnings: { smsError?: string | null; callError?: string | null };
}

/**
 * Ward-boy emergency alert.
 *
 * This previously POSTed to `http://localhost:5000/api/sos/emergency` — a route
 * that did not exist on the backend, so every alert silently 404'd — with the
 * server's URL hardcoded rather than taken from the app config.
 *
 * Redesign notes:
 *  • Every string on this screen was hardcoded English except four, while the
 *    bundle already carried `doctor.emergency.*` for all of them. This is the
 *    screen someone uses while something is going wrong, so it is the worst place
 *    to be guessing.
 *  • The three type names were long sentences ("Code Blue – Cardiac / respiratory
 *    arrest") *and* carried a description restating the same thing underneath.
 *    The names are now the code name and the description carries the clinical
 *    detail, with no repetition.
 *  • Each type's colour was applied to the whole tile including the heading text
 *    (`text-destructive` on a tinted card), which made the emergency names harder
 *    to read the more urgent they were. The colour now sits in the icon chip; the
 *    text is foreground and the meaning is carried by words, not colour.
 *  • The confirmation dialog's notes field was a raw `<textarea>` with a
 *    hardcoded label and placeholder. It uses the `Textarea` primitive and the
 *    bundle.
 *  • `Room ${doctor.room}` was a hardcoded English string being written into the
 *    alert record. It uses the same translated `Room {{number}}` string as the
 *    rest of the doctor's UI, so the record reads consistently in every language.
 *  • The result panel is a live region (`Alert` is `role="alert"`), so the outcome
 *    of an alert is announced rather than only drawn — and it distinguishes
 *    between "recorded" and "delivered", because those are not the same thing and
 *    the difference matters when the SMS gateway is down.
 */
export default function WardBoyEmergency({ doctor }: { doctor: SessionUser }) {
  const { t } = useTranslation();

  const [selected, setSelected] = useState<EmergencyType | null>(null);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EmergencyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notesId = useId();

  const EMERGENCY_TYPES: {
    id: EmergencyType;
    label: string;
    description: string;
    icon: typeof Siren;
    chip: string;
  }[] = [
    {
      id: "codeBlue",
      label: t("doctor.codeBlue"),
      description: t("doctor.emergency.codeBlueDesc"),
      icon: Siren,
      chip: "bg-destructive/10 text-destructive",
    },
    {
      id: "codeRed",
      label: t("doctor.codeRed"),
      description: t("doctor.emergency.codeRedDesc"),
      icon: Flame,
      chip: "bg-warning text-warning-foreground",
    },
    {
      id: "equipment",
      label: t("doctor.equipmentFailure"),
      description: t("doctor.emergency.equipmentDesc"),
      icon: Wrench,
      chip: "bg-primary/10 text-primary",
    },
  ];

  const sendAlert = async () => {
    if (!selected) return;
    setSending(true);
    setError(null);
    try {
      const response = await api<EmergencyResult>(apiPath("doctor", "/sos"), {
        method: "POST",
        body: {
          alertType: selected,
          notes: notes.trim() || null,
          location: doctor.room ? t("doctor.room", { number: doctor.room }) : null,
        },
      });
      setResult(response);
      setSelected(null);
      setNotes("");
    } catch (err) {
      setError(localizedError(err, t));
    } finally {
      setSending(false);
    }
  };

  const delivered = Boolean(result && (result.smsSuccess || result.callSuccess));

  return (
    <div>
      <SectionHeader title={t("doctor.emergency.title")} subtitle={t("doctor.emergency.subtitle")} />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert variant={delivered ? "success" : "destructive"} className="mb-6">
          <AlertDescription className="space-y-2">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
              {result.message}
            </p>
            <p className="text-sm">{t("doctor.emergency.alertNumber", { id: result.alertId })}</p>
            {result.warnings?.smsError && (
              <p className="text-sm">
                {t("doctor.emergency.smsNotSent", { reason: result.warnings.smsError })}
              </p>
            )}
            {result.warnings?.callError && (
              <p className="text-sm">
                {t("doctor.emergency.callNotPlaced", { reason: result.warnings.callError })}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <fieldset>
        <legend className="mb-3 text-base font-semibold text-foreground">
          {t("doctor.selectEmergencyType")}
        </legend>
        <div className="grid gap-3 md:grid-cols-3">
          {EMERGENCY_TYPES.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  setError(null);
                  setSelected(type.id);
                }}
                className="card-medical touch-target text-left transition-colors duration-150 hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span
                  aria-hidden="true"
                  className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${type.chip}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="block font-semibold text-foreground">{type.label}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {type.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="card-medical mt-6 space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t("doctor.emergency.howTitle")}
        </p>
        <p>{t("doctor.emergency.howBody")}</p>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("doctor.confirmEmergency")}</DialogTitle>
            <DialogDescription>
              {EMERGENCY_TYPES.find((e) => e.id === selected)?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={notesId}>{t("doctor.emergency.notes")}</Label>
            <Textarea
              id={notesId}
              rows={3}
              placeholder={t("doctor.emergency.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelected(null)}
              disabled={sending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={sendAlert}
              disabled={sending}
              aria-busy={sending}
            >
              <Siren aria-hidden="true" />
              {sending ? t("doctor.emergency.sending") : t("doctor.sendEmergencyAlert")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
