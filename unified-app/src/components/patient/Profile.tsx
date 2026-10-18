import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Edit,
  Globe,
  Phone,
  MapPin,
  Save,
  X,
  CalendarCheck,
  FileText,
  Heart,
  Activity,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/layout/SectionHeader";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { resolveLanguage } from "@/lib/i18n";
import { languageOption } from "@/lib/languages";
import { formatNumber, initials } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";

interface ProfileProps {
  user: SessionUser;
  onUserChange: (user: SessionUser) => void;
}

interface ProfileResponse {
  user: SessionUser;
  stats: { appointment_count: number; record_count: number; symptom_check_count: number };
}

/**
 * Patient profile.
 *
 * Redesign notes:
 *  • **Bug: the language row rendered the wrong string.** It called
 *    `t(\`language.${resolveLanguage(i18n.language)}\`)`, but the bundle keys are
 *    `language.punjabi` / `language.hindi` / `language.english`, not
 *    `language.pa`. Because `parseMissingKeyHandler` humanises a miss rather than
 *    rendering it raw, the failure was silent: every user saw "Pa" or "Hi"
 *    without an error. It now reads `labelKey` from `lib/languages.ts`, which is
 *    the single source of truth for that mapping.
 *  • The screen said "Profile" twice — once as the page `<h1>` and again as the
 *    card title directly below it. The card title is gone; the page heading is
 *    the section header.
 *  • The address field had a visible `<Label>` with no `htmlFor` while editing,
 *    so the input was unlabelled. Both editable fields now have proper
 *    associations and the age field declares its real range.
 *  • A successful save produced no feedback at all — the form just collapsed.
 *    `patient.profile.saved` existed in the bundle and was never rendered.
 *  • Logout moved to the header account menu, where it is reachable from every
 *    screen rather than only from the bottom of this one.
 *  • The activity counts were unformatted numbers; they now use the locale's
 *    digit grouping.
 */
export const Profile = ({ user, onUserChange }: ProfileProps) => {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", age: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { t, i18n } = useTranslation();
  const nameId = useId();
  const ageId = useId();
  const addressId = useId();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await api<ProfileResponse>(apiPath("patient", "/profile"));
        if (cancelled) return;
        setProfile(result);
        setDraft({
          name: result.user.name || "",
          age: result.user.age != null ? String(result.user.age) : "",
          address: result.user.address || "",
        });
      } catch (err) {
        if (cancelled) return;
        setLoadError(localizedError(err, t, "errors.generic"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const startEditing = () => {
    setDraft({
      name: profile?.user.name || "",
      age: profile?.user.age != null ? String(profile.user.age) : "",
      address: profile?.user.address || "",
    });
    setSaveError(null);
    setSaved(false);
    setIsEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await api<{ user: SessionUser }>(apiPath("patient", "/profile"), {
        method: "PUT",
        body: {
          name: draft.name.trim(),
          age: draft.age === "" ? null : Number(draft.age),
          address: draft.address.trim(),
        },
      });
      setProfile((prev) => (prev ? { ...prev, user: result.user } : prev));
      onUserChange({ ...result.user });
      setIsEditing(false);
      setSaved(true);
    } catch (err) {
      // The draft is kept, so a rejected value only needs correcting rather than
      // re-entering the whole form.
      setSaveError(localizedError(err, t));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-container-narrow">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-96 w-full" />
      </div>
    );
  }

  const displayUser = profile?.user ?? user;
  const stats = profile?.stats;
  const activeLanguage = languageOption(resolveLanguage(i18n.language));

  return (
    <div className="app-container-narrow">
      <SectionHeader title={t("patient.profile.title")} subtitle={t("patient.profile.subtitle")} />

      {loadError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <div className="card-medical space-y-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <span
            aria-hidden="true"
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground"
          >
            {initials(displayUser.name || displayUser.phone)}
          </span>

          <div className="w-full flex-1 space-y-5">
            <div className="space-y-2">
              <Label htmlFor={isEditing ? nameId : undefined}>{t("patient.profile.name")}</Label>
              {isEditing ? (
                <Input
                  id={nameId}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  autoComplete="name"
                  maxLength={120}
                />
              ) : (
                <p className="text-lg font-semibold text-foreground">
                  {displayUser.name || (
                    <span className="text-base font-normal text-muted-foreground">
                      {t("patient.profile.empty")}
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={isEditing ? ageId : undefined}>{t("patient.profile.age")}</Label>
              {isEditing ? (
                <Input
                  id={ageId}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  value={draft.age}
                  onChange={(e) => setDraft({ ...draft, age: e.target.value })}
                />
              ) : (
                <p className="text-base text-foreground">
                  {displayUser.age != null ? (
                    t("patient.profile.years", { age: displayUser.age })
                  ) : (
                    <span className="text-muted-foreground">{t("patient.profile.empty")}</span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={isEditing ? addressId : undefined} className="flex items-center gap-2">
            <MapPin aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            {t("patient.profile.address")}
          </Label>
          {isEditing ? (
            <Input
              id={addressId}
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              autoComplete="street-address"
              maxLength={240}
            />
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {displayUser.address || t("patient.profile.empty")}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Phone aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            {t("patient.profile.phone")}
          </p>
          <p className="text-sm text-muted-foreground">{displayUser.phone}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("patient.profile.phoneHint")}
          </p>
        </div>

        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Globe aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            {t("patient.profile.language")}
          </p>
          <p className="text-sm text-muted-foreground">
            {activeLanguage ? t(`language.${activeLanguage.labelKey}`) : displayUser.phone}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("patient.profile.changeLanguageHint")}
          </p>
        </div>

        {stats && (
          <section
            aria-labelledby="profile-activity-heading"
            className="border-t border-border pt-5"
          >
            <h3 id="profile-activity-heading" className="heading-eyebrow mb-4">
              {t("patient.profile.stats")}
            </h3>
            <dl className="grid grid-cols-3 gap-3">
              {[
                {
                  key: "appointments",
                  icon: CalendarCheck,
                  label: t("patient.profile.appointments"),
                  value: stats.appointment_count,
                },
                {
                  key: "records",
                  icon: FileText,
                  label: t("patient.profile.records"),
                  value: stats.record_count,
                },
                {
                  key: "checks",
                  icon: Heart,
                  label: t("patient.profile.checks"),
                  value: stats.symptom_check_count,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.key} className="rounded-lg bg-muted p-3 text-center">
                    <Icon aria-hidden="true" className="mx-auto mb-1 h-5 w-5 text-primary" />
                    <dd className="text-lg font-semibold text-foreground">
                      {formatNumber(item.value)}
                    </dd>
                    <dt className="text-xs leading-snug text-muted-foreground">{item.label}</dt>
                  </div>
                );
              })}
            </dl>
          </section>
        )}

        {saveError && (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        {saved && !isEditing && (
          <Alert variant="success">
            <Activity aria-hidden="true" />
            <AlertDescription className="font-medium">{t("patient.profile.saved")}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row">
          {isEditing ? (
            <>
              <Button onClick={save} className="flex-1" disabled={saving} aria-busy={saving}>
                <Save aria-hidden="true" />
                {saving ? t("patient.profile.saving") : t("patient.profile.save")}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                <X aria-hidden="true" />
                {t("patient.profile.cancel")}
              </Button>
            </>
          ) : (
            <Button onClick={startEditing} className="flex-1 sm:flex-none">
              <Edit aria-hidden="true" />
              {t("patient.profile.edit")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
