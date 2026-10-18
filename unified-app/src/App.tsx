import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import LanguageSelector from "./components/LanguageSelector";
import OTPLogin from "./components/auth/OTPLogin";
import PanelSelector from "./components/PanelSelector";
import DoctorPanel from "./components/DoctorPanel";
import PatientPanel from "./components/PatientPanel";
import NotFound from "./pages/NotFound";
import { AppHeader } from "./components/layout/AppHeader";
import { BrandMark } from "./components/layout/BrandLockup";
import { AuthProvider, useAuth, type Role } from "@/lib/auth";
import { setLanguage, resolveLanguage, readStoredLanguage } from "@/lib/i18n";

const queryClient = new QueryClient();

/**
 * The panel the signed-in account is allowed to use. The backend enforces this
 * too — this only decides what to render so a patient never lands on doctor UI.
 */
function panelForRole(role: Role): "doctor" | "patient" {
  return role === "doctor" ? "doctor" : "patient";
}

/** Shown while the persisted session is being re-validated against the server. */
function SessionCheck() {
  const { t } = useTranslation();
  return (
    <div className="wash-hero flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <BrandMark className="h-12 w-12" />
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 text-sm text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
        />
        {t("shell.checkingSession")}
      </div>
    </div>
  );
}

/** Sign-in screen, shared by both panels. */
function SignInScreen({
  panel,
  onBack,
}: {
  panel: "doctor" | "patient";
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="heading-page">
              {panel === "doctor" ? t("panel.doctor.title") : t("panel.patient.title")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("panel.secureLogin")}
            </p>
          </div>

          <div className="surface-float mt-7 rounded-xl p-6">
            <OTPLogin panel={panel} onBack={onBack} />
          </div>

          {panel === "doctor" && (
            <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
              {t("panel.doctor.note")}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function AppShell() {
  const { user, initialising, logout } = useAuth();

  // Which panel the user is browsing *before* signing in.
  const [requestedPanel, setRequestedPanel] = useState<"doctor" | "patient" | null>(null);

  // The language screen shows only until a language has actually been chosen.
  // This must NOT be derived from i18n.language: i18n resolves to "en" by default,
  // so treating that as a choice would persist "en" on first load and hide the
  // selector from a visitor who never picked anything.
  const [languageChosen, setLanguageChosen] = useState(() => readStoredLanguage() !== null);

  const chooseLanguage = useCallback((lang: string) => {
    // setLanguage() updates i18next, which re-renders every useTranslation()
    // subscriber — no reload — and i18n's languageChanged handler persists it.
    setLanguage(resolveLanguage(lang));
    setLanguageChosen(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setRequestedPanel(null);
  }, [logout]);

  const handleBackToPanels = useCallback(() => setRequestedPanel(null), []);
  const handlePanelSelect = useCallback(
    (panel: "doctor" | "patient") => setRequestedPanel(panel),
    []
  );

  let screen: React.ReactNode;

  if (initialising) {
    screen = <SessionCheck />;
  } else if (user) {
    screen =
      panelForRole(user.role) === "doctor" ? (
        <DoctorPanel onLogout={handleLogout} />
      ) : (
        <PatientPanel onLogout={handleLogout} />
      );
  } else if (!languageChosen) {
    screen = <LanguageSelector onLanguageSelect={chooseLanguage} />;
  } else if (!requestedPanel) {
    screen = <PanelSelector onPanelSelect={handlePanelSelect} />;
  } else {
    screen = <SignInScreen panel={requestedPanel} onBack={handleBackToPanels} />;
  }

  return (
    <BrowserRouter>
      {/*
       * First focusable element on the page. Without it a keyboard user has to
       * tab through the header on every screen before reaching the content.
       * Rendered outside <Routes> so it precedes whatever screen is showing.
       */}
      <a href="#main" className="skip-link">
        <SkipLinkLabel />
      </a>
      <Routes>
        <Route path="/" element={screen} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

function SkipLinkLabel() {
  const { t } = useTranslation();
  return <>{t("common.skipToContent")}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppShell />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
