import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useTranslation } from "react-i18next";
import {
  Video,
  CalendarDays,
  FileText,
  Siren,
  RefreshCw,
  Stethoscope,
  Phone,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionHeader } from "@/components/layout/SectionHeader";

import VideoCallSection from "./VideoCallSection";
import AppointmentQueue from "./AppointmentQueue";
import HealthRecords from "./HealthRecords";
import WardBoyEmergency from "./WardBoyEmergency";

import { api, apiPath, getToken } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { formatNumber } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";

type TabType = "videoCall" | "appointments" | "records" | "emergency";

interface DashboardStats {
  appointment_count: number;
  record_count: number;
  sos_alert_count: number;
  upcoming_count: number;
  patient_count: number;
}

interface SosAlert {
  source?: string;
  location?: string | null;
  notes?: string | null;
  phoneNumber?: string | null;
  name?: string | null;
}

/**
 * The signed-in doctor's dashboard.
 *
 * Redesign notes:
 *  • The bespoke header is gone. It hardcoded `bg-white` (a white bar in dark
 *    mode) and carried a hand-rolled profile popover: `bg-white text-gray-900`, no
 *    `role`, no focus management, no Escape, closed only by a `mousedown` listener.
 *    Identity, language, theme and Logout now live in the shared `AppHeader` +
 *    `AccountMenu`, which both panels use, so the doctor and the patient get the
 *    same chrome.
 *  • The section switcher used emoji as icons (📹 📅 📋 🚨). Emoji render
 *    differently on every platform, are read aloud by screen readers by their
 *    Unicode name ("video camera"), and are the single strongest signal that an
 *    interface was assembled rather than designed. Real icons from `lucide-react`
 *    are used, `aria-hidden`, with the label carrying the meaning.
 *  • The active tile used `transform scale-105` and `shadow-lg`; it now uses the
 *    shared selected treatment (a solid primary fill), so it reads as selected
 *    and does not resize under the pointer.
 *  • `title="REFRESH_DASHBOARD"` was a raw, untranslated key leaking into a
 *    tooltip. The refresh control now has a translated accessible name and visible
 *    text.
 *  • The SOS alert was a plain `div` with `bg-black/60` + `bg-white` and a Close
 *    button — no `role="dialog"`, no `aria-modal`, no focus trap, no Escape. A
 *    doctor who was mid-examination and reached for Escape got nothing. It is now
 *    a Radix `Dialog`, and it names the source and any location/notes it received.
 *  • `loadStats` was `useCallback(…, [])` while reading `t`, so an error stayed in
 *    whichever language was active on mount — the same stale-closure bug that was
 *    fixed across the patient panel. Stats also get a loading skeleton, so the
 *    numbers do not pop in.
 *  • Stats are formatted with the locale's digit grouping rather than rendered as
 *    raw numbers.
 *
 * The four sections are a **toggle-button group**, not a `tablist`. On mobile they
 * render as a 2×2 grid of tiles — a nav chooser, not a tab strip — and each one
 * swaps the whole page context rather than revealing a panel within one form.
 * `aria-pressed` conveys the state, and the keyboard behaviour (all four are
 * ordinary buttons) is simpler and no less accessible than roving tabindex.
 */
export default function DoctorDashboard({ doctor }: { doctor: SessionUser }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("videoCall");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [sosAlert, setSosAlert] = useState<SosAlert | null>(null);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);
    try {
      const result = await api<{ stats: DashboardStats }>(apiPath("doctor", "/dashboard"));
      setStats(result.stats);
    } catch (err) {
      setStatsError(localizedError(err, t));
    } finally {
      setLoadingStats(false);
    }
    // `t` is read above and is therefore a real dependency; leaving it out kept
    // the error message frozen in the language active at mount.
  }, [t]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Signaling socket. The token is required — the server rejects unauthenticated
  // sockets, which is what stops anyone from registering as a doctor.
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io({ transports: ["websocket"], auth: { token } });
    socket.on("connect", () => socket.emit("register", { role: "doctor", userId: doctor.id }));
    socket.on("sos-alert", (payload: SosAlert) => setSosAlert(payload));

    return () => {
      socket.disconnect();
    };
  }, [doctor.id]);

  const tabs: { id: TabType; labelKey: string; icon: typeof Video }[] = [
    { id: "videoCall", labelKey: "doctor.videoCall", icon: Video },
    { id: "appointments", labelKey: "doctor.appointmentQueue", icon: CalendarDays },
    { id: "records", labelKey: "doctor.healthRecords", icon: FileText },
    { id: "emergency", labelKey: "doctor.wardBoyEmergency", icon: Siren },
  ];

  const statTiles = stats
    ? [
        { key: "upcoming", labelKey: "doctor.statsUpcoming", value: stats.upcoming_count },
        { key: "patients", labelKey: "doctor.statsPatients", value: stats.patient_count },
        { key: "records", labelKey: "doctor.statsRecords", value: stats.record_count },
      ]
    : [];

  return (
    <>
      <div className="app-container py-8">
        <SectionHeader
          title={t("doctor.welcome", { name: doctor.name || doctor.phone })}
          subtitle={t("doctor.dashboardSubtitle")}
          actions={
            <Button variant="outline" onClick={loadStats} disabled={loadingStats}>
              <RefreshCw aria-hidden="true" className={loadingStats ? "animate-spin" : undefined} />
              {t("common.refresh")}
            </Button>
          }
        />

        <div className="card-medical mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10"
          >
            <Stethoscope className="h-6 w-6 text-primary" />
          </span>

          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <dt className="sr-only">{t("doctor.phone")}</dt>
              <Phone aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <dd className="text-foreground">{doctor.phone}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="sr-only">{t("doctor.specialty")}</dt>
              <dd className="text-foreground">
                {doctor.specialty || t("common.none")}
              </dd>
            </div>
          </dl>

          {doctor.room && (
            <Badge variant="secondary" className="badge-inline">
              {t("doctor.room", { number: doctor.room })}
            </Badge>
          )}
        </div>

        {statsError && (
          <Alert variant="destructive" className="mb-6">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{statsError}</AlertDescription>
          </Alert>
        )}

        <div className="mb-8">
          {loadingStats ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : statTiles.length > 0 ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {statTiles.map((tile) => (
                <li key={tile.key} className="card-medical">
                  <p className="text-2xl font-bold text-foreground">
                    {formatNumber(tile.value)}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t(tile.labelKey)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div
          role="group"
          aria-label={t("doctor.sectionsLabel")}
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                id={`doctor-tab-${tab.id}`}
                aria-pressed={active}
                aria-controls="doctor-section"
                onClick={() => setActiveTab(tab.id)}
                className={
                  "touch-target flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-colors duration-150 " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent")
                }
              >
                <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span className="text-sm font-medium leading-tight">{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* One region for the active section, labelled by the tile that selected
          it, so a screen-reader user is told which section they have moved into. */}
      <section
        id="doctor-section"
        aria-labelledby={`doctor-tab-${activeTab}`}
        className="app-container pb-16"
      >
        {activeTab === "videoCall" && <VideoCallSection doctor={doctor} />}
        {activeTab === "appointments" && <AppointmentQueue />}
        {activeTab === "records" && <HealthRecords />}
        {activeTab === "emergency" && <WardBoyEmergency doctor={doctor} />}
      </section>

      <Dialog open={Boolean(sosAlert)} onOpenChange={(open) => !open && setSosAlert(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Siren aria-hidden="true" className="h-5 w-5" />
              {t("doctor.emergency.title")}
            </DialogTitle>
            <DialogDescription>
              {sosAlert?.source === "doctor"
                ? t("doctor.emergency.raisedByDoctor")
                : t("doctor.emergency.raisedByPatient")}
              {sosAlert?.location ? ` • ${sosAlert.location}` : ""}
            </DialogDescription>
          </DialogHeader>

          {(sosAlert?.notes || sosAlert?.phoneNumber || sosAlert?.name) && (
            <dl className="space-y-2 text-sm">
              {sosAlert?.name && (
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">{t("doctor.records.details")}</dt>
                  <dd className="font-medium text-foreground">{sosAlert.name}</dd>
                </div>
              )}
              {(sosAlert?.notes || sosAlert?.phoneNumber) && (
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">{t("doctor.phone")}</dt>
                  <dd className="font-medium text-foreground">
                    {sosAlert.notes || sosAlert.phoneNumber}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <DialogFooter>
            <Button onClick={() => setSosAlert(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
