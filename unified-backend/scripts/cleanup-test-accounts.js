// Removes accounts created by end-to-end test runs that requested a one-time
// code but never completed verification.
const { db, dbHelpers } = require("../db");

const TEST_PHONES = [
  "+919999111111",
  "+919999999999",
  "+919253024104", // ad-hoc account created while probing the UI by hand
];

for (const phone of TEST_PHONES) {
  db.prepare("DELETE FROM login_events WHERE phone = ?").run(phone);
  db.prepare("DELETE FROM otp_codes WHERE phone = ?").run(phone);
  const removed = db.prepare("DELETE FROM users WHERE phone = ?").run(phone);
  console.log(`${phone}: removed ${removed.changes} user row(s)`);
}

// Remove appointments created by the automated test runs.
const testAppointments = db
  .prepare("DELETE FROM appointments WHERE description = ?")
  .run("Smoke test booking");
console.log(`test appointments: removed ${testAppointments.changes} row(s)`);

console.log("\nUsers remaining:");
for (const row of db.prepare("SELECT phone, role, full_name FROM users ORDER BY phone").all()) {
  console.log(`  ${row.role.padEnd(8)} ${row.phone}  ${row.full_name || "(no name)"}`);
}
console.log(`\n${dbHelpers.listDoctors().length} doctors, ${dbHelpers.listPatients().length} patients`);