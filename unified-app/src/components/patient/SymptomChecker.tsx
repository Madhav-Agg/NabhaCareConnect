import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  Thermometer,
  Heart,
  Zap,
  AlertTriangle,
  Siren,
  RefreshCw,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { useToast } from "@/hooks/use-toast";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { resolveLanguage } from "@/lib/i18n";

interface Symptom {
  id: string;
  icon: LucideIcon;
  severity: "low" | "medium" | "high";
}

interface AnalysisResult {
  isEmergency: boolean;
  severity: "low" | "medium" | "high";
  recommendations: string;
}

/**
 * A symptom list used to prompt the patient. This is a fixed vocabulary of common
 * complaints, not patient records — it is intentionally static UI content.
 *
 * Only the ids live here; the display names come from
 * `patient.symptoms.symptoms.<id>` in the locale bundles, so adding a language
 * means adding one file rather than editing this array three times.
 *
 * The icon is stored as a component rather than a JSX element so it can be given
 * `aria-hidden`, which an inline element cannot receive from a parent reliably.
 */
const SYMPTOMS: Symptom[] = [
  { id: "fever", icon: Thermometer, severity: "medium" },
  { id: "headache", icon: Brain, severity: "low" },
  { id: "nausea", icon: AlertTriangle, severity: "medium" },
  { id: "cold", icon: Brain, severity: "low" },
  { id: "acidity", icon: AlertTriangle, severity: "low" },
  { id: "body_pain", icon: Zap, severity: "low" },
  { id: "chest_pain", icon: Heart, severity: "high" },
  { id: "fatigue", icon: Zap, severity: "low" },
  { id: "cough", icon: Brain, severity: "low" },
];

/** Numeric weight per severity, used to compute the overall assessment. */
const WEIGHT: Record<Symptom["severity"], number> = { low: 1, medium: 2, high: 3 };

/**
 * AI symptom assessment.
 *
 * Redesign notes:
 *  • The emergency banner was hardcoded English — the single most important
 *    sentence in the product for a Punjabi or Hindi reader, and
 *    `patient.symptoms.emergencyBanner` already existed in all three bundles.
 *  • Severity was shown as a `secondary` Badge with an inline
 *    `bg-warning text-warning-foreground` override, which meant the one state
 *    that most needs to stand out was the one with no visual system behind it. It
 *    uses the shared `status-*` pills, whose contrast is checked by
 *    `scripts/check-contrast.mjs`.
 *  • The confidence bar had a `value` and no name, so it announced as an
 *    unlabelled progress bar. It is now named and its value is exposed as text
 *    through the severity label rather than by colour alone.
 *  • The "Analyze symptoms" button was disabled until at least one symptom was
 *    chosen. There is already a message for that case (`noneSelected`), and a
 *    disabled button cannot deliver it — so the button is now enabled and the
 *    message does the explaining.
 *  • The additional-information textarea was preceded by an `<h3>` that was not
 *    associated with it. It now has a real label.
 *  • The heading structure started at `CardTitle` (an `<h3>`) with no `<h2>`
 *    above it, skipping a level. The section header is the `<h2>`.
 *  • Icons on the symptom tiles are `aria-hidden`: the tile's name is its label.
 */
export const SymptomChecker = () => {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const { t, i18n } = useTranslation();
  const infoId = useId();

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const analyze = async () => {
    if (selected.length === 0) {
      toast({
        title: t("patient.symptoms.noneSelected"),
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setAiError(null);

    try {
      // The active language drives both the symptom wording shown to the model
      // and the language the AI answers in, so it is read from i18next rather
      // than passed down as a prop.
      const lang = resolveLanguage(i18n.language);
      const names = SYMPTOMS.filter((s) => selected.includes(s.id))
        .map((s) => t(`patient.symptoms.symptoms.${s.id}`))
        .join(", ");

      const symptomsText = additionalInfo.trim()
        ? `${names}. ${additionalInfo.trim()}`
        : names;

      // The previous version wrote the model's reply into the DOM with
      // `innerHTML`, so any prompt-injected content in the response executed as
      // script in the patient's session. The reply is now rendered as React text,
      // which escapes it.
      const response = await api<{ isEmergency: boolean; recommendations: string }>(
        apiPath("patient", "/symptoms/check-symptoms"),
        { method: "POST", body: { symptoms: symptomsText, language: lang } }
      );

      const maxSeverity = Math.max(
        ...SYMPTOMS.filter((s) => selected.includes(s.id)).map((s) => WEIGHT[s.severity])
      );

      setResult({
        isEmergency: Boolean(response.isEmergency),
        severity: maxSeverity >= 3 ? "high" : maxSeverity === 2 ? "medium" : "low",
        recommendations: response.recommendations,
      });
    } catch (err) {
      setResult(null);
      setAiError(localizedError(err, t));
      toast({ title: t("common.error"), description: t("errors.generic"), variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const severityLabel = (severity: AnalysisResult["severity"]) =>
    severity === "high"
      ? t("patient.symptoms.severityHigh")
      : severity === "medium"
        ? t("patient.symptoms.severityMedium")
        : t("patient.symptoms.severityLow");

  const severityClass = (severity: AnalysisResult["severity"]) =>
    severity === "high" ? "status-danger" : severity === "medium" ? "status-warning" : "status-waiting";

  if (result) {
    const severityBar = result.severity === "high" ? 90 : result.severity === "medium" ? 60 : 30;

    return (
      <div className="app-container">
        <SectionHeader
          title={t("patient.symptoms.results")}
          subtitle={t("patient.symptoms.subtitle")}
        />

        {result.isEmergency && (
          <Alert variant="destructive" className="mb-6">
            <Siren aria-hidden="true" />
            <AlertDescription className="font-semibold">
              {t("patient.symptoms.emergencyBanner")}
            </AlertDescription>
          </Alert>
        )}

        <div className="card-medical space-y-6">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">
              {t("patient.symptoms.severity")}
            </h3>
            <span className={severityClass(result.severity)}>{severityLabel(result.severity)}</span>
            <Progress
              value={severityBar}
              aria-label={`${t("patient.symptoms.severity")}: ${severityLabel(result.severity)}`}
              className="mt-2"
            />
          </div>

          <div>
            <h3 className="mb-2 text-base font-semibold text-foreground">
              {t("patient.symptoms.recommendations")}
            </h3>
            <div className="rounded-lg bg-muted p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
              {result.recommendations}
            </div>
          </div>

          <Button variant="outline" onClick={() => setResult(null)}>
            <RefreshCw aria-hidden="true" />
            {t("patient.symptoms.newAssessment")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <SectionHeader title={t("patient.symptoms.title")} subtitle={t("patient.symptoms.subtitle")} />

      <div className="card-medical space-y-6">
        {aiError && (
          <Alert variant="destructive">
            <AlertDescription>{aiError}</AlertDescription>
          </Alert>
        )}

        <fieldset>
          <legend className="mb-3 text-base font-semibold text-foreground">
            {t("patient.symptoms.selectSymptoms")}
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SYMPTOMS.map((symptom) => {
              const Icon = symptom.icon;
              const active = selected.includes(symptom.id);
              return (
                <button
                  key={symptom.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(symptom.id)}
                  className={
                    "touch-target flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors duration-150 " +
                    (active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground")
                  }
                >
                  <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="chip-label text-center text-sm font-medium">
                    {t(`patient.symptoms.symptoms.${symptom.id}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor={infoId}>{t("patient.symptoms.additionalInfoOptional")}</Label>
          <Textarea
            id={infoId}
            placeholder={t("patient.symptoms.additionalPlaceholder")}
            value={additionalInfo}
            onChange={(e) => setAdditionalInfo(e.target.value)}
            maxLength={1000}
            rows={4}
          />
        </div>

        <Button onClick={analyze} disabled={isAnalyzing} className="w-full" size="lg" aria-busy={isAnalyzing}>
          {isAnalyzing ? t("patient.symptoms.analyzing") : t("patient.symptoms.analyze")}
          {!isAnalyzing && <Brain aria-hidden="true" />}
        </Button>

        {/* Says plainly what this screen is and is not. Both statements are read
            from the existing disclaimer wording rather than newly invented. */}
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ClipboardList aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("patient.remedies.disclaimer")}
        </p>
      </div>
    </div>
  );
};
