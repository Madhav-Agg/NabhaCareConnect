import DoctorDashboard from "./doctor/DoctorDashboard";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";

interface DoctorPanelProps {
  onLogout: () => void;
}

/**
 * Renders the doctor dashboard for the signed-in doctor.
 *
 * The previous version invented a doctor object here — `name: userData?.name ||
 * 'Dr. Sample'`, `specialty: 'Cardiology'`, `room: '101'` — and the dashboard then
 * added `age: 35` and a made-up hospital address on top. Everything now comes
 * from the authenticated account record.
 *
 * It also renders the same `AppHeader` the patient panel uses, with the account
 * menu in it, so the doctor's identity, language control, theme control and
 * Logout are in the one place a user will look for them — rather than in a
 * bespoke white header with a hand-rolled popover.
 */
const DoctorPanel = ({ onLogout }: DoctorPanelProps) => {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader>
        <AccountMenu name={user.name} phone={user.phone} onLogout={onLogout} />
      </AppHeader>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <h1 className="sr-only">{t("doctor.dashboard")}</h1>
        <DoctorDashboard doctor={user} />
      </main>

      <AppFooter />
    </div>
  );
};

export default DoctorPanel;
