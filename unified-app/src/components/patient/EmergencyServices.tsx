import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Phone, Shield, Siren, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/EmptyState";
import { SectionHeader } from "@/components/layout/SectionHeader";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { useAuth } from "@/lib/auth";

interface EmergencyContact {
  id: string;
  name: string;
  dialNumber: string;
  phone: string;
  note: string;
}

interface SosResult {
  success: boolean;
  recorded: boolean;
  alertId: number;
  smsSuccess: boolean;
  callSuccess: boolean;
  message: string;
  warnings: { smsError?: string | null; callError?: string | null };
}

/**
 * Emergency services.
 *
 * Redesign notes:
 *  • The SOS panel's explanatory paragraph was hardcoded English even though
 *    `patient.emergency.sosBody` existed in all three bundles — on the one screen
 *    where being understood matters most.
 *  • "Alert #", "SMS not sent:" and "Call not placed:" were also hardcoded; the
 *    doctor's alert panel already had all three as keys.
 *  • The contacts empty state rendered `errors.generic` ("Something went wrong")
 *    when a patient has no contacts configured. That was not an error and the
 *    message gave no clue what to do; it now says so plainly and explains that
 *    the numbers below still work.
 *  • "Retry" was hardcoded while `common.retry` existed.
 *  • The SOS button keeps its size — it is the one control in the product where a
 *    large, unmistakable target is the right answer, and it is a real `<button>`
 *    with `aria-busy` while the alert is in flight. `hover:scale` is removed:
 *    growing the target under the pointer on hover is disorienting on touch.
 *  • `loadContacts` is memoised on `t`, which it read but did not depend on.
 */
export const EmergencyServices = () => {
  const { user } = useAuth();

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sosResult, setSosResult] = useState<SosResult | null>(null);
  const { t } = useTranslation();

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ data: EmergencyContact[] }>(
        apiPath("patient", "/emergency-contacts")
      );
      setContacts(result.data || []);
    } catch (err) {
      setError(localizedError(err, t, "errors.generic"));
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const sendSos = async () => {
    setSending(true);
    setError(null);
    setSosResult(null);
    try {
      const result = await api<SosResult>(apiPath("patient", "/sos"), {
        method: "POST",
        body: {
          alertType: "sos",
          notes: user?.name ? `Raised by ${user.name}` : null,
        },
      });
      setSosResult(result);
    } catch (err) {
      setError(localizedError(err, t, "apiErrors.noRecipients"));
    } finally {
      setSending(false);
    }
  };

  const delivered = Boolean(sosResult && (sosResult.smsSuccess || sosResult.callSuccess));

  return (
    <div className="app-container">
      <SectionHeader
        title={t("patient.emergency.title")}
        subtitle={t("patient.emergency.subtitle")}
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {sosResult && (
        <Alert variant={delivered ? "success" : "destructive"} className="mb-6">
          <AlertDescription className="space-y-1.5">
            {/* The server's own wording is shown verbatim — it is the factual
                record of what was attempted, and paraphrasing it locally would
                be inventing an outcome. */}
            <p className="font-medium">{sosResult.message}</p>
            <p className="text-sm">
              {t("patient.emergency.alertNumber", { id: sosResult.alertId })}
            </p>
            {sosResult.warnings?.smsError && (
              <p className="text-sm">
                {t("patient.emergency.smsNotSent", { reason: sosResult.warnings.smsError })}
              </p>
            )}
            {sosResult.warnings?.callError && (
              <p className="text-sm">
                {t("patient.emergency.callNotPlaced", { reason: sosResult.warnings.callError })}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="card-medical mb-6 flex flex-col items-center gap-5 border-destructive/40 py-8">
        <button
          type="button"
          onClick={sendSos}
          disabled={sending}
          aria-busy={sending}
          className="flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-full bg-destructive text-destructive-foreground shadow-lg transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-destructive/40 focus-visible:ring-offset-4 focus-visible:ring-offset-background disabled:opacity-60"
        >
          <Siren aria-hidden="true" className="h-11 w-11" />
          <span className="px-3 text-center text-sm font-bold">
            {sending ? t("patient.emergency.sosSending") : t("patient.emergency.sosButton")}
          </span>
        </button>

        <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
          {t("patient.emergency.sosBody")}
        </p>
      </div>

      <section aria-labelledby="emergency-contacts-heading" className="card-medical">
        <h3
          id="emergency-contacts-heading"
          className="flex items-center gap-2 text-lg font-semibold text-foreground"
        >
          <Shield aria-hidden="true" className="h-5 w-5 text-primary" />
          {t("patient.emergency.contactsTitle")}
        </h3>

        <div className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon={Phone}
              title={t("patient.emergency.noContacts")}
              hint={t("patient.emergency.noContactsHint")}
              action={
                <Button variant="outline" onClick={loadContacts}>
                  <RefreshCw aria-hidden="true" />
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <a
                    href={`tel:${contact.dialNumber}`}
                    aria-label={t("patient.emergency.ariaCall", {
                      name: contact.name,
                      number: contact.dialNumber,
                    })}
                    className="flex h-full items-center gap-3 rounded-lg border border-border p-4 transition-colors duration-150 hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/10"
                    >
                      <Phone className="h-5 w-5 text-destructive" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{contact.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {contact.note || t("common.none")}
                      </span>
                    </span>
                    <span className="shrink-0 text-lg font-semibold text-primary">
                      {contact.dialNumber}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {t("patient.emergency.fallback")}
          </p>
        </div>
      </section>
    </div>
  );
};
