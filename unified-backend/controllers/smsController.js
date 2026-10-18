// Outbound SMS helpers.
//
// Previously returned `{ success: true }` when Twilio was unconfigured, silently
// dropping the message. These now report a real 503 so callers cannot believe a
// message was delivered when it was not.

const twilio = require("twilio");

let client = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.warn("⚠️  Twilio client init failed for SMS:", err.message);
  }
}

const notConfigured = (res) =>
  res.status(503).json({
    success: false,
    code: "TWILIO_NOT_CONFIGURED",
    error: "SMS delivery is not configured on this server.",
  });

/** POST /api/patient/sms/send */
exports.sendSms = async (req, res, next) => {
  try {
    const { to, message } = req.body || {};
    if (!to || !message) {
      return res.status(400).json({ success: false, error: "to and message are required." });
    }
    if (typeof message !== "string" || message.length > 1000) {
      return res
        .status(400)
        .json({ success: false, error: "message must be a string under 1000 characters." });
    }
    if (!client) return notConfigured(res);

    const msg = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    return res.json({ success: true, sid: msg.sid, to });
  } catch (err) {
    console.error("❌ SMS send failed:", err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
};

/** POST /api/patient/sms/send-sos */
exports.sendSosSms = async (req, res, next) => {
  try {
    const to = (req.body?.phone || req.body?.to || "").trim();
    if (!to) {
      return res.status(400).json({ success: false, error: "phone is required." });
    }
    if (!client) return notConfigured(res);

    const msg = await client.messages.create({
      body: "🚨 SOS Alert from NabhaCare Connect — immediate help needed.",
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    return res.json({ success: true, sid: msg.sid, to });
  } catch (err) {
    console.error("❌ SOS SMS failed:", err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
};