// Profile for the authenticated account.
//
// Replaces the Profile screen that previously rendered a hardcoded
// { name: "Madhav Aggarwal", age: "19", address: "Civil Road, Nabha, Punjab" }
// and only console.log'd "saves".

const express = require("express");
const router = express.Router();

const { dbHelpers } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { fail } = require("../utils/errorCodes");
const { publicUser } = require("../middleware/auth");

const MAX_NAME = 120;
const MAX_ADDRESS = 300;

router.get("/", requireAuth(), (req, res) => {
  const stats =
    req.user.role === "doctor"
      ? dbHelpers.statsForDoctor(req.user.phone)
      : dbHelpers.statsForPhone(req.user.phone);

  return res.json({
    success: true,
    user: publicUser(req.user),
    stats,
  });
});

router.put("/", requireAuth(), (req, res) => {
  const { fullName, name, age, address } = req.body || {};

  const newName = (fullName ?? name ?? "").toString().trim();
  const newAddress = (address ?? "").toString().trim();

  if (newName === "" && req.body?.name !== undefined) {
    return fail(res, 400, "NAME_REQUIRED");
  }
  if (newName.length > MAX_NAME) {
    return res.status(400).json({ success: false, error: `Name must be under ${MAX_NAME} characters.` });
  }
  if (newAddress.length > MAX_ADDRESS) {
    return res
      .status(400)
      .json({ success: false, error: `Address must be under ${MAX_ADDRESS} characters.` });
  }

  if (age !== undefined && age !== null && age !== "") {
    const parsed = Number(age);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 120) {
      return res
        .status(400)
        .json({ success: false, error: "Age must be a whole number between 0 and 120." });
    }
  }

  const updated = dbHelpers.updateUserProfile(req.user.phone, {
    full_name: newName || null,
    age,
    address: newAddress || null,
  });

  return res.json({ success: true, user: publicUser(updated) });
});

module.exports = router;