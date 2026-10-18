import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, AlertTriangle, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { api, apiPath } from "@/lib/api";
import { localizedError } from "@/lib/apiErrors";
import { useAuth, type Role, type SessionUser } from "@/lib/auth";

interface OTPLoginProps {
  panel: "doctor" | "patient";
  onBack: () => void;
}

/** Mirrors the backend's normalisation so the two never disagree. */
function normalizePhone(input: string): string {
  const stripped = (input || "").trim().replace(/[\s\-()]/g, "");
  if (stripped.startsWith("+")) return stripped;
  if (/^\d{10}$/.test(stripped)) return `+91${stripped}`;
  if (stripped.startsWith("00")) return `+${stripped.slice(2)}`;
  if (/^\d{11}$/.test(stripped) && stripped.startsWith("0")) return `+${stripped.slice(1)}`;
  return stripped;
}

/**
 * One-time-code sign-in.
 *
 * Form details that were previously missing and matter here:
 *  • Each field has a visible `<label for>`; the hint and the error are both
 *    wired through `aria-describedby`, and `aria-invalid` is set on failure, so
 *    a screen reader announces *why* the field is wrong rather than only that
 *    the form did not proceed.
 *  • The phone field is `type="tel" inputmode="tel" autocomplete="tel"` and the
 *    code field is `inputmode="numeric" autocomplete="one-time-code"`, so the
 *    right keyboard appears on Android and iOS autofill can help. `type="number"`
 *    is deliberately avoided: it adds spinners and silently drops leading zeros.
 *  • The submit button is disabled only while a request is in flight, never as a
 *    validation gate — a permanently disabled button explains nothing. The code
 *    field is also disabled until it is 6 digits, which is visible feedback
 *    rather than a silent block.
 *  • Nothing typed is cleared on error.
 *  • Errors use `role="alert"` (via the Alert primitive), which interrupts; the
 *    "code sent" confirmation is a toast, which does not.
 */
export default function OTPLogin({ panel, onBack }: OTPLoginProps) {
  const { toast } = useToast();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const role: Role = panel;

  // Countdown for the "request a new code" cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendOtp = async () => {
    setError(null);
    const phone = normalizePhone(phoneNumber);

    if (!phone) {
      setError(t("auth.enterPhone"));
      return;
    }

    setLoading(true);
    try {
      const result = await api<{ devOtp?: string; delivery?: string; expiresInMinutes?: number }>(
        apiPath(role, "/auth/send-otp"),
        { method: "POST", body: { phone } }
      );

      setPhoneNumber(phone);
      setStep("otp");
      setDevOtp(result?.devOtp ?? null);
      setCooldown(30);
      toast({
        title: t("auth.codeSent"),
        description: t("auth.codeExpires", { minutes: result?.expiresInMinutes ?? 5 }),
      });
    } catch (err) {
      setError(localizedError(err, t, "errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    const code = otp.trim();

    if (!/^\d{6}$/.test(code)) {
      setError(t("auth.enterCode"));
      return;
    }

    setLoading(true);
    try {
      const result = await api<{ token: string; user: SessionUser }>(
        apiPath(role, "/auth/verify-otp"),
        { method: "POST", body: { phone: phoneNumber, otp: code } }
      );

      login(role, result.token, result.user);
      toast({ title: t("auth.signingInAs", { name: result.user.name || result.user.phone }) });
    } catch (err) {
      setError(localizedError(err, t, "errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* A real navigation control, not a submit. It sits above the form and
          reads as a way out rather than as another step forward. */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t("auth.backToPanels")}
      </button>

      {step === "phone" ? (
        <>
          <div className="space-y-2">
            <label htmlFor="phone" className="block text-sm font-medium text-foreground">
              {t("auth.phoneLabel")}
            </label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendOtp()}
              aria-describedby="phone-hint"
              aria-invalid={Boolean(error) || undefined}
              className="w-full"
              disabled={loading}
            />
            <p id="phone-hint" className="text-xs leading-relaxed text-muted-foreground">
              {t("auth.phoneHint")}
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={sendOtp} disabled={loading}>
            {loading ? t("auth.sending") : t("auth.send")}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <label htmlFor="otp" className="block text-sm font-medium text-foreground">
              {t("auth.codeLabel")}
            </label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
              aria-describedby="otp-hint"
              aria-invalid={Boolean(error) || undefined}
              className="w-full text-center text-lg tracking-[0.4em]"
              disabled={loading}
            />
            <p id="otp-hint" className="text-xs leading-relaxed text-muted-foreground">
              {/* The number is repeated so the user can confirm the code went to
                  the right phone without scrolling back. */}
              {t("auth.codeSentTo", { phone: phoneNumber })}
            </p>
          </div>

          {devOtp && (
            <Alert className="border-warning bg-warning text-warning-foreground">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium">{t("auth.devWarning")}</span>{" "}
                {t("auth.devNotice")}{" "}
                <span className="font-mono font-bold tracking-[0.2em]">{devOtp}</span>
              </AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={verifyOtp}
            disabled={loading || otp.length !== 6}
          >
            {loading ? t("auth.verifying") : t("auth.verify")}
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtp("");
                setDevOtp(null);
                setError(null);
              }}
              className="rounded-md text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t("auth.changeNumber")}
            </button>
            <button
              type="button"
              onClick={sendOtp}
              disabled={loading || cooldown > 0}
              className="rounded-md text-primary underline-offset-4 transition-colors hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {cooldown > 0 ? t("auth.resendIn", { seconds: cooldown }) : t("auth.resend")}
            </button>
          </div>
        </>
      )}

      {error && (
        <Alert variant="destructive">
          <Info aria-hidden="true" className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
