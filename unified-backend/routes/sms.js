const express = require("express");
const router = express.Router();

const { sendSms, sendSosSms } = require("../controllers/smsController");
const { requireAuth } = require("../middleware/auth");

router.post("/send", requireAuth(), sendSms);
router.post("/send-sos", requireAuth(), sendSosSms);

module.exports = router;