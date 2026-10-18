const express = require("express");
const router = express.Router();

const { makeCall } = require("../controllers/callController");
const { requireAuth } = require("../middleware/auth");

router.post("/emergency", requireAuth(), makeCall);

module.exports = router;