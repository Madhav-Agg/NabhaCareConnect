// Doctor-only read models: dashboard statistics and the patient directory.
//
// Replaces the doctor's hardcoded roster (Preet Kaur / Hardeep Singh / Simran
// Bhatia) and hardcoded profile fields (age 35, "Nabha Primary Health Center",
// "123 Medical Street").

const express = require("express");
const router = express.Router();

const { dbHelpers } = require("../db");
const { requireAuth } = require("../middleware/auth");

/** GET /api/doctor/dashboard — real counts for the signed-in doctor. */
router.get("/dashboard", requireAuth("doctor"), (req, res) => {
  const stats = dbHelpers.statsForDoctor(req.user.phone);
  const upcoming = dbHelpers
    .listAppointments({ doctorPhone: req.user.phone })
    .filter((a) => a.status === "scheduled");

  return res.json({
    success: true,
    stats: {
      ...stats,
      upcoming_count: upcoming.length,
      patient_count: dbHelpers.listPatients().length,
    },
    upcoming: upcoming.slice(0, 10),
  });
});

/** GET /api/doctor/patients — registered patients, with their record counts. */
router.get("/patients", requireAuth("doctor"), (req, res) => {
  const patients = dbHelpers.listPatients().map((p) => {
    const stats = dbHelpers.statsForPhone(p.phone);
    return {
      phone: p.phone,
      name: p.full_name || "Unnamed patient",
      age: p.age,
      address: p.address,
      lastVisit: dbHelpers.listHealthRecords(p.phone)[0]?.date || null,
      appointmentCount: stats.appointment_count,
      recordCount: stats.record_count,
    };
  });

  return res.json({ success: true, data: patients });
});

module.exports = router;