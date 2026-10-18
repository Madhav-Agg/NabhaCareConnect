// Development seed.
//
// Provisions one doctor and one patient so the app is usable on a fresh machine.
//
// SAFETY GUARDS
//   * Refuses to run when NODE_ENV=production.
//   * Refuses to run unless ALLOW_DEV_SEED=true.
//   * Never invents passwords. These accounts are OTP-only: they sign in with the
//     same "phone number + one-time code" flow as any other user. The seed only
//     creates the doctor record that a self-registering user could never create,
//     which is what authorises the doctor panel.
//   * Re-running is idempotent (upsert by phone), so it never clobbers edits to
//     patient profile data.

require("dotenv").config();

const { dbHelpers, DB_PATH } = require("../db");

function assertSafeToRun() {
  if ((process.env.NODE_ENV || "development") === "production") {
    console.error("✖️  Refusing to seed: NODE_ENV is 'production'.");
    process.exit(1);
  }
  if ((process.env.ALLOW_DEV_SEED || "false").toLowerCase() !== "true") {
    console.error(
      "✖️  Refusing to seed: set ALLOW_DEV_SEED=true in unified-backend/.env first.\n" +
        "   This flag exists so seeding can never happen by accident."
    );
    process.exit(1);
  }
}

const DOCTORS = [
  {
    phone: "+919876500001",
    role: "doctor",
    full_name: "Dr. Amrit Singh",
    specialty: "General Medicine",
    room: "101",
  },
  {
    phone: "+919876500002",
    role: "doctor",
    full_name: "Dr. Preet Kaur",
    specialty: "Paediatrics",
    room: "102",
  },
];

const PATIENTS = [
  {
    phone: "+919876500101",
    role: "patient",
    full_name: "Gurpreet Singh",
    age: 42,
    address: "Civil Road, Nabha, Punjab",
  },
  {
    phone: "+919876500102",
    role: "patient",
    full_name: "Simran Kaur",
    age: 31,
    address: "Model Town, Nabha, Punjab",
  },
];

const RECORDS = [
  {
    patient_phone: "+919876500101",
    date: "2026-01-12",
    type: "consultation",
    title: "General check-up",
    description: "Routine review. Blood pressure 124/78. Continue current lifestyle advice.",
    doctor_name: "Dr. Amrit Singh",
    facility: "Nabha Primary Health Centre",
  },
  {
    patient_phone: "+919876500101",
    date: "2026-02-03",
    type: "lab",
    title: "Complete blood count",
    description: "Haemoglobin 14.2 g/dL, WBC within range. No action required.",
    doctor_name: "Dr. Amrit Singh",
    facility: "Nabha Primary Health Centre",
  },
  {
    patient_phone: "+919876500102",
    date: "2026-02-18",
    type: "consultation",
    title: "Seasonal fever",
    description: "Viral fever, 3 days. Plenty of fluids, paracetamol as needed. Review if worse.",
    doctor_name: "Dr. Preet Kaur",
    facility: "Nabha Primary Health Centre",
  },
];

function main() {
  assertSafeToRun();

  console.log(`🌱 Seeding development data into ${DB_PATH}`);

  for (const doctor of DOCTORS) {
    const created = dbHelpers.upsertUser(doctor);
    console.log(`   doctor  ${created.phone}  ${created.full_name} (${created.specialty})`);
  }

  for (const patient of PATIENTS) {
    const created = dbHelpers.upsertUser(patient);
    console.log(`   patient ${created.phone}  ${created.full_name}`);
  }

  // Only seed sample records when the patient has none, so re-running the seed
  // never duplicates or overwrites real data.
  for (const record of RECORDS) {
    if (dbHelpers.listHealthRecords(record.patient_phone).length > 0) continue;
    dbHelpers.createHealthRecord({ ...record, doctor_phone: null });
    console.log(`   record  ${record.patient_phone}  ${record.title}`);
  }

  console.log("✅ Seed complete.");
  console.log("");
  console.log("These accounts have no passwords. Sign in from the app:");
  console.log("   Doctor  → panel 'Doctor'   → phone +919876500001");
  console.log("   Patient → panel 'Patient' → phone +919876500101");
  console.log("");
  console.log(
    "The one-time code is delivered by SMS. With no Twilio credentials configured, " +
      "set DEV_EXPOSE_OTP=true and the code is returned in the send-otp response."
  );
}

main();