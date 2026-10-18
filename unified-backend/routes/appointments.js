// Appointment booking and queue management.
//
// The patient booking form previously wrote straight to Supabase from the browser
// with a hardcoded anon key, so appointments had no owner, were not scoped to the
// logged-in user, and the doctor's queue had nothing real to display. Bookings now
// flow through the backend and are keyed to the authenticated account.

const express = require("express");
const router = express.Router();

const { dbHelpers } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { fail } = require("../utils/errorCodes");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CONSULTATION_TYPES = new Set(["video", "phone", "in-person"]);
const STATUSES = new Set(["scheduled", "completed", "cancelled"]);
const MAX_DESCRIPTION = 1000;

/** GET /api/patient/appointments/doctors — bookable doctors from the database. */
router.get("/doctors", requireAuth(), (req, res) => {
  const doctors = dbHelpers.listDoctors().map((d) => ({
    phone: d.phone,
    name: d.full_name || "Unnamed doctor",
    specialty: d.specialty,
    room: d.room,
  }));
  return res.json({ success: true, data: doctors });
});

/** GET — the caller's own appointments (patient) or their queue (doctor). */
router.get("/", requireAuth(), (req, res) => {
  const appointments =
    req.user.role === "doctor"
      ? dbHelpers.listAppointments({ doctorPhone: req.user.phone })
      : dbHelpers.listAppointments({ patientPhone: req.user.phone });
  return res.json({ success: true, data: appointments });
});

/** POST — a patient books an appointment with themselves as the patient. */
router.post("/", requireAuth("patient"), (req, res) => {
  const {
    doctorPhone,
    date,
    time,
    consultationType,
    description,
    patientName,
    patientAge,
    patientCondition,
  } = req.body || {};

  if (!doctorPhone) {
    return fail(res, 400, "DOCTOR_REQUIRED");
  }
  if (!DATE_RE.test(String(date || ""))) {
    return fail(res, 400, "INVALID_DATE");
  }
  if (!TIME_RE.test(String(time || ""))) {
    return fail(res, 400, "INVALID_TIME");
  }
  if (!CONSULTATION_TYPES.has(consultationType)) {
    return fail(res, 400, "CONSULTATION_TYPE_INVALID", `Consultation type must be one of: ${[...CONSULTATION_TYPES].join(", ")}.`);
  }
  if (description && String(description).length > MAX_DESCRIPTION) {
    return fail(res, 400, "FIELD_TOO_LONG", `Description must be under ${MAX_DESCRIPTION} characters.`);
  }

  // The doctor must actually exist — this stops bookings for invented providers.
  const doctor = dbHelpers.findUserByPhone(doctorPhone);
  if (!doctor || doctor.role !== "doctor") {
    return fail(res, 400, "DOCTOR_UNKNOWN");
  }

  const clash = dbHelpers
    .listAppointments({ doctorPhone })
    .find((a) => a.date === date && a.time === time && a.status === "scheduled");
  if (clash) {
    return fail(res, 409, "SLOT_TAKEN");
  }

  const appointment = dbHelpers.createAppointment({
    patient_phone: req.user.phone,
    patient_name: patientName || req.user.full_name || null,
    patient_age: patientAge ?? req.user.age ?? null,
    patient_condition: patientCondition || null,
    doctor_phone: doctor.phone,
    // The doctor's name and specialty always come from the database, never from
    // the request body, so a client cannot book an appointment under a false name.
    doctor_name: doctor.full_name || "Unnamed doctor",
    specialty: doctor.specialty || null,
    date,
    time,
    consultation_type: consultationType,
    description: description || null,
    status: "scheduled",
  });

  return res.status(201).json({ success: true, data: appointment });
});

/** PATCH /:id — a patient cancels their own, a doctor updates their own. */
router.patch("/:id", requireAuth(), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return fail(res, 400, "INVALID_ID");
  }

  const existing = dbHelpers.getAppointment(id);
  if (!existing) {
    return fail(res, 404, "NOT_FOUND");
  }

  const isOwnerPatient = existing.patient_phone === req.user.phone;
  const isOwnerDoctor = existing.doctor_phone === req.user.phone;
  if (!isOwnerPatient && !isOwnerDoctor) {
    return fail(res, 403, "FORBIDDEN", "You do not have access to this appointment.");
  }

  const patch = {};
  const { status, date, time, consultationType, description } = req.body || {};

  if (status !== undefined) {
    if (!STATUSES.has(status)) {
      return fail(res, 400, "STATUS_INVALID", `Status must be one of: ${[...STATUSES].join(", ")}.`);
    }
    // A patient may only cancel; a doctor controls the full lifecycle.
    if (req.user.role === "patient" && status !== "cancelled") {
      return fail(res, 403, "FORBIDDEN", "Patients can only cancel an appointment.");
    }
    patch.status = status;
  }

  if (req.user.role === "doctor") {
    if (date !== undefined) {
      if (!DATE_RE.test(String(date))) {
        return fail(res, 400, "INVALID_DATE");
      }
      patch.date = date;
    }
    if (time !== undefined) {
      if (!TIME_RE.test(String(time))) {
        return fail(res, 400, "INVALID_TIME");
      }
      patch.time = time;
    }
    if (consultationType !== undefined) {
      if (!CONSULTATION_TYPES.has(consultationType)) {
        return fail(res, 400, "CONSULTATION_TYPE_INVALID", "Invalid consultation type.");
      }
      patch.consultation_type = consultationType;
    }
    if (description !== undefined) {
      if (String(description).length > MAX_DESCRIPTION) {
        return fail(res, 400, "FIELD_TOO_LONG", "Description is too long.");
      }
      patch.description = description;
    }
  }

  return res.json({ success: true, data: dbHelpers.updateAppointment(id, patch) });
});

/** DELETE /:id — owner only, and only while still scheduled. */
router.delete("/:id", requireAuth(), (req, res) => {
  const id = Number(req.params.id);
  const existing = dbHelpers.getAppointment(id);
  if (!existing) {
    return fail(res, 404, "NOT_FOUND");
  }

  const isOwnerPatient = existing.patient_phone === req.user.phone;
  const isOwnerDoctor = existing.doctor_phone === req.user.phone;
  if (!isOwnerPatient && !isOwnerDoctor) {
    return fail(res, 403, "FORBIDDEN", "You do not have access to this appointment.");
  }
  if (existing.status === "completed") {
    return fail(res, 409, "ALREADY_COMPLETED");
  }

  dbHelpers.deleteAppointment(id);
  return res.json({ success: true });
});

module.exports = router;