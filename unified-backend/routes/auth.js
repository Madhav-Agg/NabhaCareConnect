const express = require("express");
const router = express.Router();

const { sendOtp, verifyOtp, me, logout } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

// Public: proves possession of the phone number.
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

// Protected: requires a valid bearer token for the matching role.
router.get("/me", requireAuth(), me);
router.post("/logout", requireAuth(), logout);

module.exports = router;