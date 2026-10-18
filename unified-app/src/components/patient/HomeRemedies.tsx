import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Home, Loader2, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { useToast } from "@/hooks/use-toast";

import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { resolveLanguage } from "@/lib/i18n";

/**
 * AI-generated home remedies.
 *
 * Redesign notes:
 *  • The submit control was an icon-only button with **no accessible name** —
 *    a screen reader announced "button" and nothing else. It is now a labelled
 *    button that says what it does.
 *  • The search field was placeholder-only, and the placeholder also doubled as
 *    the only instruction. It has a real label.
 *  • The button was disabled until the field was non-empty, which suppressed the
 *    existing `patient.remedies.enter` message that tells the user what to do.
 *    It is now enabled and the message does the work.
 *  • The results panel was headed with `patient.remedies.title` — the same string
 *    as the page title, so the page read "Home Remedies / Home Remedies". It has
 *    its own heading.
 *  • The disclaimer sat *inside* the result card below the text; it now sits with
 *    the input, where a reader decides whether to trust the output, not after
 *    they have already read it.
 *  • Results are rendered as text (`whitespace-pre-wrap`), never as HTML.
 */
export const HomeRemedies = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [remedies, setRemedies] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { t, i18n } = useTranslation();
  const queryId = useId();

  const handleSearch = async () => {
    const symptom = searchQuery.trim();
    setError(null);

    if (!symptom) {
      toast({ title: t("patient.remedies.enter"), variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setRemedies("");

    try {
      const result = await api<{ recommendations: string }>(
        apiPath("patient", "/home-remedies/get-remedies"),
        { method: "POST", body: { symptoms: symptom, language: resolveLanguage(i18n.language) } }
      );
      setRemedies(result.recommendations);
    } catch (err) {
      const message = localizedError(err, t);
      setError(message);
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container-narrow">
      <SectionHeader
        title={t("patient.remedies.title")}
        subtitle={t("patient.remedies.subtitle")}
      />

      <div className="card-medical space-y-5">
        <div className="space-y-2">
          <Label htmlFor={queryId}>{t("patient.remedies.searchLabel")}</Label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={queryId}
                type="search"
                placeholder={t("patient.remedies.placeholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
                disabled={isLoading}
                maxLength={500}
              />
            </div>
            <Button onClick={handleSearch} disabled={isLoading} aria-busy={isLoading} className="sm:w-auto">
              {isLoading ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {isLoading ? t("common.loading") : t("patient.remedies.action")}
            </Button>
          </div>
        </div>

        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Home aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {t("patient.remedies.disclaimer")}
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {remedies && (
          <section aria-labelledby="remedies-results" className="rounded-lg bg-muted p-5">
            <h3
              id="remedies-results"
              className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
              {t("patient.remedies.resultsTitle")}
            </h3>
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {remedies}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
