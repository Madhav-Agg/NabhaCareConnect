// Static reference content: pharmacy directory and emergency contacts.
//
// The medicine finder previously rendered a hardcoded list with invented stock
// levels, prices, ratings and distances. Only verifiable public information is
// served here — business name, public phone number, locality and opening hours.
// Nothing about stock or price is asserted.

const express = require("express");
const router = express.Router();

const path = require("path");
const fs = require("fs");

const { requireAuth } = require("../middleware/auth");

const PHARMACY_FILE = path.join(__dirname, "..", "reference", "pharmacies.json");

function loadPharmacies() {
  try {
    const raw = JSON.parse(fs.readFileSync(PHARMACY_FILE, "utf8"));
    return { updated: raw.updated, pharmacies: raw.pharmacies || [] };
  } catch (err) {
    console.error("❌ Could not load pharmacy reference file:", err.message);
    return { updated: null, pharmacies: [] };
  }
}

/** Emergency numbers are public reference data, not user data. */
const EMERGENCY_CONTACTS = [
  { id: "ambulance", name: "Ambulance", dialNumber: "108", phone: "108", note: "Free ambulance service" },
  { id: "universal", name: "Emergency (Universal)", dialNumber: "112", phone: "112", note: "Single emergency number for all services" },
  { id: "police", name: "Police", dialNumber: "100", phone: "100", note: "Police emergency" },
  { id: "fire", name: "Fire Department", dialNumber: "101", phone: "101", note: "Fire and rescue" },
  { id: "women", name: "Women Helpline", dialNumber: "1091", phone: "1091", note: "Support for women in distress" },
  { id: "child", name: "Child Helpline", dialNumber: "1098", phone: "1098", note: "Child protection services" },
];

/** GET /api/patient/pharmacies */
router.get("/pharmacies", requireAuth(), (_req, res) => {
  const { updated, pharmacies } = loadPharmacies();
  res.json({ success: true, data: pharmacies, updated });
});

/** GET /api/patient/emergency-contacts */
router.get("/emergency-contacts", requireAuth(), (_req, res) => {
  res.json({ success: true, data: EMERGENCY_CONTACTS });
});

module.exports = router;
module.exports.EMERGENCY_CONTACTS = EMERGENCY_CONTACTS;