// Health records.
//
// A patient reads and creates their own records; a doctor reads and writes records
// for any patient. Every read is checked against the patient_phone column, so one
// account can never read another account's medical history by guessing an id.

const express = require("express");
const router = express.Router();

const { dbHelpers } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { fail } = require("../utils/errorCodes");

const RECORD_TYPES = new Set([
  "consultation",
  "lab",
  "xray",
  "prescription",
  "vaccination",
  "surgery",
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE = 160;
const MAX_DESCRIPTION = 4000;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

/** GET / — own records (patient) or a specific patient's (doctor, ?patientPhone=). */
router.get("/", requireAuth(), (req, res) => {
  let targetPhone = req.user.phone;

  if (req.user.role === "doctor") {
    const requested = (req.query.patientPhone || "").toString().trim();
    if (requested) {
      if (!PHONE_RE.test(requested)) {
        return res
          .status(400)
          .json({ success: false, error: "patientPhone must be in international format." });
      }
      if (!dbHelpers.findUserByPhone(requested)) {
        return fail(res, 404, "NOT_FOUND", "No such patient.");
      }
      targetPhone = requested;
    }
  }

  return res.json({
    success: true,
    data: dbHelpers.listHealthRecords(targetPhone),
  });
});

/** POST — a doctor files a record for a patient; a patient files their own. */
router.post("/", requireAuth(), (req, res) => {
  const { patientPhone, date, type, title, description, doctorName, facility } = req.body || {};

  let targetPhone = req.user.phone;
  if (req.user.role === "doctor" && patientPhone) {
    if (!PHONE_RE.test(String(patientPhone))) {
      return res
        .status(400)
        .json({ success: false, error: "patientPhone must be in international format." });
    }
    const patient = dbHelpers.findUserByPhone(patientPhone);
    if (!patient || patient.role !== "patient") {
      return fail(res, 404, "NOT_FOUND", "No such patient.");
    }
    targetPhone = patient.phone;
  }

  if (!DATE_RE.test(String(date || ""))) {
    return res.status(400).json({ success: false, error: "date must be in YYYY-MM-DD format." });
  }
  if (!RECORD_TYPES.has(type)) {
    return res.status(400).json({
      success: false,
      error: `type must be one of: ${[...RECORD_TYPES].join(", ")}.`,
    });
  }
  if (typeof title !== "string" || !title.trim()) {
    return fail(res, 400, "TITLE_REQUIRED");
  }
  if (title.length > MAX_TITLE) {
    return res.status(400).json({ success: false, error: `title must be under ${MAX_TITLE} characters.` });
  }
  if (description && String(description).length > MAX_DESCRIPTION) {
    return res.status(400).json({ success: false, error: "description is too long." });
  }

  const record = dbHelpers.createHealthRecord({
    patient_phone: targetPhone,
    doctor_phone: req.user.role === "doctor" ? req.user.phone : null,
    date,
    type,
    title: title.trim(),
    description: description || null,
    doctor_name: doctorName || (req.user.role === "doctor" ? req.user.full_name : null),
    facility: facility || null,
  });

  return res.status(201).json({ success: true, data: record });
});

/** DELETE /:id — the owning patient, or any doctor who filed it. */
router.delete("/:id", requireAuth(), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, error: "Invalid record id." });
  }

  const record = dbHelpers.getHealthRecord(id);
  if (!record) {
    return fail(res, 404, "NOT_FOUND");
  }

  const allowed =
    record.patient_phone === req.user.phone ||
    (req.user.role === "doctor" && record.doctor_phone === req.user.phone);

  if (!allowed) {
    return res
      .status(403)
      .json({ success: false, error: "You do not have access to this record." });
  }

  dbHelpers.deleteHealthRecord(id);
  return res.json({ success: true });
});

module.exports = router;