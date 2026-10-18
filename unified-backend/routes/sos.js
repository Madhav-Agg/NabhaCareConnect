// SOS alert handling.
//
// Behaviour change: when Twilio is not configured these endpoints previously
// replied `{ success: true }`, which told patients their ambulance had been
// contacted when nothing had been sent. Every alert is now always persisted to
// the database, and the response reports exactly which channels were dispatched.

const express = require("express");
const router = express.Router();

const twilio = require("twilio");
const { dbHelpers } = require("../db");
const { requireAuth, optionalAuth } = require("../middleware/auth");

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.warn("⚠️  Twilio client init failed for SOS:", err.message);
  }
} else {
  console.warn(
    "⚠️  Twilio is not configured. SOS alerts will be stored and relayed in-app only — " +
      "no SMS or voice call will be placed."
  );
}

const EMERGENCY_CONTACTS = String(process.env.SOS_RECIPIENT_NUMBERS || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

function recipientsFor(req) {
  // Alert the configured responders plus, for doctor-triggered alerts, everyone
  // the doctor listed. Never default to the victim's own number.
  const extra = [req.body?.phone, req.body?.phoneNumber].filter(Boolean);
  return [...new Set([...EMERGENCY_CONTACTS, ...extra])];
}

async function dispatchSms(recipients, body) {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    return { dispatched: false, sids: [], reason: "Twilio is not configured on this server." };
  }
  const sids = [];
  const errors = [];
  for (const to of recipients) {
    try {
      const msg = await twilioClient.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
      });
      sids.push(msg.sid);
    } catch (err) {
      errors.push(`${to}: ${err.message}`);
    }
  }
  if (sids.length === 0) {
    return { dispatched: false, sids, reason: `SMS dispatch failed (${errors.join("; ")})` };
  }
  return { dispatched: true, sids, errors };
}

async function dispatchCall(recipients, twiml) {
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    return { dispatched: false, sids: [], reason: "Twilio is not configured on this server." };
  }
  const sids = [];
  const errors = [];
  for (const to of recipients) {
    try {
      const call = await twilioClient.calls.create({
        to,
        from: process.env.TWILIO_PHONE_NUMBER,
        twiml,
      });
      sids.push(call.sid);
    } catch (err) {
      errors.push(`${to}: ${err.message}`);
    }
  }
  if (sids.length === 0) {
    return { dispatched: false, sids, reason: `Call dispatch failed (${errors.join("; ")})` };
  }
  return { dispatched: true, sids, errors };
}

/**
 * POST /api/{patient|doctor}/sos
 * Body: { alertType?, notes?, location? }
 * Alert is always recorded; SMS/voice dispatch depends on Twilio.
 */
async function handleSOS(req, res, next) {
  try {
    const alertType = req.body?.alertType || req.body?.type || "sos";
    const notes = req.body?.notes || req.body?.description || null;
    const location = req.body?.location || req.body?.userLocation || null;

    const recipients = recipientsFor(req);
    if (recipients.length === 0) {
      return res.status(503).json({
        success: false,
        error:
          "No emergency recipients are configured. Set SOS_RECIPIENT_NUMBERS in the " +
          "backend .env before SOS alerts can be dispatched.",
        code: "NO_RECIPIENTS",
      });
    }

    const who =
      req.user?.role === "doctor"
        ? `Doctor ${req.user.full_name || req.user.phone}`
        : `Patient ${req.user?.full_name || req.user?.phone || "unknown"}`;

    const text = `🚨 SOS from ${who}${location ? ` @ ${location}` : ""}${
      notes ? ` — ${notes}` : ""
    }`;

    const sms = await dispatchSms(recipients, text);
    const call = await dispatchCall(
      recipients,
      '<Response><Say voice="alice">An SOS alert was raised. Please respond immediately.</Say></Response>'
    );

    const record = dbHelpers.storeSOSAlert({
      phone: req.user?.phone || null,
      source: req.user?.role || "anonymous",
      alert_type: alertType,
      notes,
      location,
      sms_sid: sms.sids[0] || null,
      call_sid: call.sids[0] || null,
      ip_address: req.ip || req.socket?.remoteAddress || null,
    });

    // Real-time notification for doctors currently online in the dashboard.
    req.app.get("io")?.to("role:doctor").emit("sos-alert", {
      id: record.id,
      alertType,
      notes,
      location,
      phoneNumber: record.phone,
      source: record.source,
      timestamp: record.created_at,
    });

    const dispatched = sms.dispatched || call.dispatched;

    return res.status(dispatched ? 200 : 503).json({
      success: dispatched,
      recorded: true,
      alertId: record.id,
      smsSuccess: sms.dispatched,
      callSuccess: call.dispatched,
      // Honest about what did not happen.
      warnings: {
        smsError: sms.dispatched ? null : sms.reason,
        callError: call.dispatched ? null : call.reason,
      },
      message: dispatched
        ? "SOS alert dispatched and logged."
        : "SOS alert logged, but no SMS or call could be sent. Use the emergency call button on your phone.",
    });
  } catch (err) {
    return next(err);
  }
}

router.post("/", requireAuth(), handleSOS);
// Kept for the doctor panel's existing call site.
router.post("/emergency", requireAuth(), handleSOS);

// GET /api/{role}/sos/alerts — audit trail.
router.get("/alerts", requireAuth("doctor"), (req, res) => {
  res.json({ success: true, data: dbHelpers.listSOSAlerts() });
});

// Anonymous relay used by the public-facing emergency screen.
router.post("/public", optionalAuth, handleSOS);

module.exports = router;