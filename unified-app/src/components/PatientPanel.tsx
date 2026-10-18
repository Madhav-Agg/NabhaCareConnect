import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { HealthcareNav } from "./patient/HealthcareNav";
import { VideoConsultSection } from "./patient/VideoConsultSection";
import { MedicineFinderSection } from "./patient/MedicineFinderSection";
import { SymptomChecker } from "./patient/SymptomChecker";
import { HealthRecords } from "./patient/HealthRecords";
import { EmergencyServices } from "./patient/EmergencyServices";
import { AppointmentBooking } from "./patient/AppointmentBooking";
import { AppointmentsList } from "./patient/AppointmentsList";
import { FAQButton } from "./patient/FAQButton";
import { HomeRemedies } from "./patient/HomeRemedies";
import { Profile } from "./patient/Profile";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { useAuth } from "@/lib/auth";
import { SectionNavContext } from "@/lib/panelNavigation";

interface PatientPanelProps {
  onLogout: () => void;
}

export type PatientSection =
  | "consult"
  | "medicines"
  | "appointments"
  | "myAppointments"
  | "records"
  | "symptoms"
  | "remedies"
  | "profile"
  | "emergency";

/** Title key per section, so focus can land on the heading the user just asked for. */
const SECTION_TITLES: Record<PatientSection, string> = {
  consult: "patientNav.consult",
  medicines: "patientNav.medicines",
  appointments: "patientNav.book",
  myAppointments: "patientNav.myVisits",
  records: "patientNav.records",
  symptoms: "patientNav.symptoms",
  remedies: "patientNav.remedies",
  profile: "patientNav.profile",
  emergency: "patientNav.emergency",
};

const PatientPanel = ({ onLogout }: PatientPanelProps) => {
  const { user, setUser } = useAuth();
  const { t } = useTranslation();
  const [currentSection, setCurrentSection] = useState<PatientSection>("consult");

  const mainRef = useRef<HTMLElement | null>(null);
  // Skips the focus move on first mount: stealing focus from the browser on
  // load disorients a screen-reader user before they have heard anything.
  const hasNavigated = useRef(false);

  const navigate = useCallback((section: string) => {
    setCurrentSection(section as PatientSection);
  }, []);

  /*
   * Section changes are a full context switch — the entire main region is
   * replaced — so focus must move with it. Without this, a keyboard or
   * screen-reader user stays focused on the nav tile they just pressed and has
   * no signal that anything changed; `aria-current` updates silently.
   *
   * Focus goes to <main>, not to a heading: <main> always exists, whereas the
   * heading inside each section varies, and moving to a container with
   * tabindex="-1" is announced as the new region by every screen reader.
   */
  useEffect(() => {
    if (!hasNavigated.current) {
      hasNavigated.current = true;
      return;
    }
    mainRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [currentSection]);

  // `user` is guaranteed non-null: App.tsx only renders this panel for a patient.
  if (!user) return null;

  const renderSection = () => {
    switch (currentSection) {
      case "consult":
        return <VideoConsultSection />;
      case "medicines":
        return <MedicineFinderSection />;
      case "appointments":
        return <AppointmentBooking />;
      case "myAppointments":
        return <AppointmentsList />;
      case "records":
        return <HealthRecords />;
      case "symptoms":
        return <SymptomChecker />;
      case "remedies":
        return <HomeRemedies />;
      case "profile":
        return <Profile user={user} onUserChange={setUser} />;
      case "emergency":
        return <EmergencyServices />;
      default:
        return <VideoConsultSection />;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader>
        <AccountMenu
          name={user.name}
          phone={user.phone}
          onLogout={onLogout}
          onProfile={() => navigate("profile")}
        />
      </AppHeader>
      <HealthcareNav onNavigate={navigate} currentSection={currentSection} />

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 scroll-mt-24 py-8 pb-28 outline-none lg:pb-8"
      >
        {/* The page's only <h1>, and the label for the region the nav switched
            to. It is visually hidden because each section renders its own visible
            heading (an <h2>), and repeating it as visible text would put the
            section name on screen twice. */}
        <h1 className="sr-only">{t(SECTION_TITLES[currentSection])}</h1>

        <SectionNavContext.Provider value={navigate}>
          {renderSection()}
        </SectionNavContext.Provider>
      </main>

      <AppFooter />
      <FAQButton />
    </div>
  );
};

export default PatientPanel;
