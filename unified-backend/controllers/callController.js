// Emergency voice-call dispatch (Twilio).

const twilio = require("twilio");

let client = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.warn("⚠️  Twilio client init failed for calls:", err.message);
  }
} else {
  console.warn(
    "⚠️  Twilio is not configured. The emergency call endpoint will return 503 instead of " +
      "pretending to place a call."
  );
}

/**
 * POST /api/patient/call/emergency
 * Body: { phoneNumber } — optional; defaults to the configured emergency number.
 */
exports.makeCall = async (req, res, next) => {
  try {
    const configured = String(process.env.EMERGENCY_CALL_NUMBER || "").trim();
    const to = (req.body?.phoneNumber || configured).trim();

    if (!to) {
      return res.status(400).json({
        success: false,
        error: "No phone number supplied and EMERGENCY_CALL_NUMBER is not configured.",
      });
    }

    if (!client || !process.env.TWILIO_PHONE_NUMBER) {
      return res.status(503).json({
        success: false,
        code: "TWILIO_NOT_CONFIGURED",
        error:
          "Automated calls are not configured on this server. Please dial the emergency " +
          "number directly from your phone.",
        attemptedTo: to,
      });
    }

    const call = await client.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml:
        '<Response><Say voice="alice">This is an automated emergency call from NabhaCare Connect.</Say></Response>',
    });

    return res.json({ success: true, sid: call.sid, to });
  } catch (err) {
    console.error("❌ Emergency call failed:", err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
};

exports.twilioConfigured = () => Boolean(client && process.env.TWILIO_PHONE_NUMBER);