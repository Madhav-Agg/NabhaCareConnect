// End-to-end smoke test for the backend auth + data flow.
//
//   node scripts/smoke-test.js            (server must already be running)
//   BASE_URL=http://localhost:5000 node scripts/smoke-test.js
//
// Exercises: OTP login (valid + invalid), role separation, protected-route
// enforcement, and the main data endpoints. Exits non-zero on the first failure.

const BASE = process.env.BASE_URL || "http://localhost:5000";

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, body: json };
}

async function signIn(role, phone) {
  const sent = await api("POST", `/api/${role}/auth/send-otp`, { body: { phone } });
  const code = sent.body?.devOtp;
  if (!code) throw new Error(`no devOtp in send-otp response: ${JSON.stringify(sent.body)}`);
  const verified = await api("POST", `/api/${role}/auth/verify-otp`, {
    body: { phone, otp: code },
  });
  return { sent, verified, code };
}

async function main() {
  console.log(`\nSmoke testing ${BASE}\n`);

  // --- health -------------------------------------------------------------
  console.log("Health");
  const health = await api("GET", "/health");
  check("GET /health returns 200", health.status === 200, `got ${health.status}`);

  // --- the deleted universal bypass --------------------------------------
  console.log("\nAuthentication regression");
  const bypass = await api("POST", "/api/patient/auth/verify-otp", {
    body: { phone: "+919999999999", otp: "123456" },
  });
  check(
    "old backup OTP 123456 is rejected",
    bypass.status === 401,
    `expected 401, got ${bypass.status} ${JSON.stringify(bypass.body)}`
  );

  const badPhone = await api("POST", "/api/patient/auth/send-otp", { body: { phone: "12345" } });
  check("invalid phone rejected by send-otp", badPhone.status === 400, `got ${badPhone.status}`);

  const badOtpFormat = await api("POST", "/api/patient/auth/verify-otp", {
    body: { phone: "+919876500101", otp: "abc" },
  });
  check(
    "non-6-digit OTP rejected",
    badOtpFormat.status === 400,
    `got ${badOtpFormat.status}`
  );

  // --- valid patient login ------------------------------------------------
  console.log("\nPatient login");
  const patient = await signIn("patient", "+919876500101");
  check("send-otp succeeded", patient.sent.status === 200, JSON.stringify(patient.sent.body));
  check("verify-otp succeeded", patient.verified.status === 200, JSON.stringify(patient.verified.body));
  check("a JWT was issued", typeof patient.verified.body?.token === "string");
  check("user payload returned", patient.verified.body?.user?.role === "patient");
  const patientToken = patient.verified.body?.token;

  const wrongOtp = await api("POST", "/api/patient/auth/verify-otp", {
    body: { phone: "+919876500101", otp: "000000" },
  });
  check("wrong OTP rejected with 401", wrongOtp.status === 401, `got ${wrongOtp.status}`);

  // --- unauthorized access -----------------------------------------------
  console.log("\nAuthorization");
  for (const [label, method, path, body] of [
    ["profile", "GET", "/api/patient/profile"],
    ["appointments", "GET", "/api/patient/appointments"],
    ["records", "GET", "/api/patient/records"],
    ["doctor dashboard", "GET", "/api/doctor/dashboard"],
    ["doctor patients", "GET", "/api/doctor/patients"],
    ["symptom check", "POST", "/api/patient/symptoms/check-symptoms", { symptoms: "headache" }],
    ["home remedies", "POST", "/api/patient/home-remedies/get-remedies", { symptoms: "headache" }],
    ["SOS", "POST", "/api/patient/sos", {}],
    ["emergency call", "POST", "/api/patient/call/emergency", {}],
    ["sms", "POST", "/api/patient/sms/send", { to: "+919876500001", message: "hi" }],
    ["profile write", "PUT", "/api/patient/profile", { name: "x" }],
  ]) {
    const res = await api(method, path, { body });
    check(`${label} rejects anonymous request`, res.status === 401, `got ${res.status}`);
  }

  const bogus = await api("GET", "/api/patient/profile", { token: "not-a-real-token" });
  check("forged token rejected", bogus.status === 401, `got ${bogus.status}`);

  // --- valid doctor login + role separation ------------------------------
  console.log("\nDoctor login and role separation");
  const doctor = await signIn("doctor", "+919876500001");
  check("doctor verify-otp succeeded", doctor.verified.status === 200, JSON.stringify(doctor.verified.body));
  const doctorToken = doctor.verified.body?.token;

  const crossUse = await api("GET", "/api/doctor/profile", { token: patientToken });
  check("patient token cannot open doctor endpoints", crossUse.status === 403, `got ${crossUse.status}`);

  const selfRegister = await api("POST", "/api/doctor/auth/verify-otp", {
    body: { phone: "+919876500101", otp: patient.code },
  });
  check(
    "patient cannot re-verify as doctor",
    selfRegister.status === 401 || selfRegister.status === 403,
    `got ${selfRegister.status}`
  );

  const doctorMe = await api("GET", "/api/doctor/auth/me", { token: doctorToken });
  check("doctor /me returns the doctor", doctorMe.body?.user?.role === "doctor", JSON.stringify(doctorMe.body));

  // --- doctor data --------------------------------------------------------
  console.log("\nDoctor data");
  const dashboard = await api("GET", "/api/doctor/dashboard", { token: doctorToken });
  check("dashboard returns stats", dashboard.status === 200 && typeof dashboard.body?.stats === "object");

  const patients = await api("GET", "/api/doctor/patients", { token: doctorToken });
  check(
    "patient directory lists real seeded patients",
    Array.isArray(patients.body?.data) && patients.body.data.length >= 2,
    JSON.stringify(patients.body).slice(0, 200)
  );

  // --- patient data -------------------------------------------------------
  console.log("\nPatient data");
  const doctors = await api("GET", "/api/patient/appointments/doctors", { token: patientToken });
  check("bookable doctors listed", doctors.body?.data?.length >= 2, JSON.stringify(doctors.body).slice(0, 200));

  const profile = await api("GET", "/api/patient/profile", { token: patientToken });
  check(
    "profile returns the real account",
    profile.body?.user?.name === "Gurpreet Singh",
    JSON.stringify(profile.body?.user)
  );

  const updated = await api("PUT", "/api/patient/profile", {
    token: patientToken,
    body: { name: "Gurpreet Singh", age: 43, address: "Civil Road, Nabha, Punjab" },
  });
  check("profile update persists", updated.body?.user?.age === 43, JSON.stringify(updated.body?.user));

  const badProfile = await api("PUT", "/api/patient/profile", {
    token: patientToken,
    body: { age: 999 },
  });
  check("invalid age rejected", badProfile.status === 400, `got ${badProfile.status}`);

  const records = await api("GET", "/api/patient/records", { token: patientToken });
  check(
    "patient sees only their own records",
    Array.isArray(records.body?.data) &&
      records.body.data.length > 0 &&
      records.body.data.every((r) => r.patient_phone === "+919876500101"),
    JSON.stringify(records.body?.data?.map((r) => r.patient_phone))
  );

  const otherPatient = await signIn("patient", "+919876500102");
  const otherRecords = await api("GET", "/api/patient/records", {
    token: otherPatient.verified.body.token,
  });
  check(
    "a second patient cannot see the first patient's records",
    otherRecords.body?.data?.every((r) => r.patient_phone === "+919876500102") === true,
    JSON.stringify(otherRecords.body?.data?.map((r) => r.patient_phone))
  );

  // --- appointment lifecycle ---------------------------------------------
  console.log("\nAppointment lifecycle");
  const booked = await api("POST", "/api/patient/appointments", {
    token: patientToken,
    body: {
      doctorPhone: "+919876500001",
      doctorName: "Dr. Amrit Singh",
      date: "2026-06-01",
      time: "10:30",
      consultationType: "video",
      description: "Smoke test booking",
    },
  });
  check("booking created", booked.status === 201, JSON.stringify(booked.body));
  const appointmentId = booked.body?.data?.id;

  const clash = await api("POST", "/api/patient/appointments", {
    token: patientToken,
    body: {
      doctorPhone: "+919876500001",
      doctorName: "Dr. Amrit Singh",
      date: "2026-06-01",
      time: "10:30",
      consultationType: "phone",
    },
  });
  check("double-booking rejected", clash.status === 409, `got ${clash.status}`);

  const fakeDoctor = await api("POST", "/api/patient/appointments", {
    token: patientToken,
    body: {
      doctorPhone: "+919999999999",
      doctorName: "Dr. Imaginary",
      date: "2026-06-02",
      time: "09:00",
      consultationType: "video",
    },
  });
  check("booking an unregistered doctor rejected", fakeDoctor.status === 400, `got ${fakeDoctor.status}`);

  const patientMarksDone = await api("PATCH", `/api/patient/appointments/${appointmentId}`, {
    token: patientToken,
    body: { status: "completed" },
  });
  check("patient cannot mark an appointment completed", patientMarksDone.status === 403, `got ${patientMarksDone.status}`);

  const doctorCompletes = await api("PATCH", `/api/doctor/appointments/${appointmentId}`, {
    token: doctorToken,
    body: { status: "completed" },
  });
  check("doctor can complete it", doctorCompletes.body?.data?.status === "completed", JSON.stringify(doctorCompletes.body));

  const doctorQueue = await api("GET", "/api/doctor/appointments", { token: doctorToken });
  check(
    "booking appears in the doctor queue",
    doctorQueue.body?.data?.some((a) => a.id === appointmentId),
    JSON.stringify(doctorQueue.body?.data?.map((a) => a.id))
  );

  // --- patient cannot touch the doctor panel ------------------------------
  const patientTriesQueue = await api("PATCH", `/api/doctor/appointments/${appointmentId}`, {
    token: patientToken,
    body: { status: "scheduled" },
  });
  check(
    "patient cannot modify through the doctor route",
    patientTriesQueue.status === 403,
    `got ${patientTriesQueue.status}`
  );

  // --- cleanup ------------------------------------------------------------
  if (appointmentId) {
    await api("DELETE", `/api/doctor/appointments/${appointmentId}`, { token: doctorToken });
  }

  // --- unknown route ------------------------------------------------------
  const missing = await api("GET", "/api/does-not-exist");
  check("unknown API route returns JSON 404", missing.status === 404 && missing.body?.success === false);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});