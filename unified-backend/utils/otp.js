// One-time-password issuance, storage and verification.
//
// Fixes the original flow, which accepted a single hardcoded backup OTP (123456)
// for *any* phone number at *any* time — a total authentication bypass.
//
// New behaviour:
//   * OTP codes are random, single-use, expire after OTP_TTL_MINUTES, and are
//     stored only as a salted SHA-256 hash.
//   * Verification is strictly per-phone + per-purpose; there is no global code.
//   * Attempt counters and a cooldown block brute-forcing the 6-digit space.
//   * Delivery is over Twilio SMS when configured. When it is not, the code is
//     returned in the response ONLY if DEV_EXPOSE_OTP=true AND NODE_ENV is not
//     production, so local development remains usable without weakening prod.

require("dotenv").config();

const crypto = require("crypto");
const twilio = require("twilio");

const { db } = require("../db");

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 5);
const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 30);

const IS_PRODUCTION = (process.env.NODE_ENV || "development") === "production";
const DEV_EXPOSE_OTP =
  (process.env.DEV_EXPOSE_OTP || "false").toLowerCase() === "true" && !IS_PRODUCTION;

if (DEV_EXPOSE_OTP) {
  console.warn(
    "⚠️  DEV_EXPOSE_OTP=true: OTP codes will be returned in API responses and logged. " +
      "Never enable this in production."
  );
}

// --- Twilio ---------------------------------------------------------------
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.warn("⚠️  Twilio client init failed:", err.message);
    twilioClient = null;
  }
}

function hashOtp(phone, code) {
  const salt = process.env.OTP_PEPPER || process.env.JWT_SECRET || "nabhacare";
  return crypto.createHash("sha256").update(`${salt}:${phone}:${code}`).digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function secondsUntilResendAllowed(phone, purpose) {
  const last = db
    .prepare(
      `SELECT created_at FROM otp_codes
        WHERE phone = ? AND purpose = ? AND consumed_at IS NULL
        ORDER BY id DESC LIMIT 1`
    )
    .get(phone, purpose);

  if (!last) return 0;

  const lastSent = Date.parse(`${last.created_at.replace(" ", "T")}Z`);
  const elapsed = (Date.now() - lastSent) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
}

/**
 * Create and persist a fresh OTP for `phone`.
 *
 * Optional profile details are attached to the pending code rather than written to
 * the users table. Creating the account here would let anyone who can send an SMS
 * write unlimited rows into the database without ever verifying anything.
 *
 * @returns {{code:string|null, expiresAt:number, resendAfter:number}}
 */
async function issueOtp(phone, purpose, profile = null) {
  const resendAfter = secondsUntilResendAllowed(phone, purpose);
  if (resendAfter > 0) {
    const err = new Error(
      `Please wait ${resendAfter} seconds before requesting another code.`
    );
    err.statusCode = 429;
    throw err;
  }

  const code = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_MINUTES * 60 * 1000;

  // Supersede any outstanding code for this phone/purpose.
  db.prepare(
    `UPDATE otp_codes SET consumed_at = ?
      WHERE phone = ? AND purpose = ? AND consumed_at IS NULL`
  ).run(Date.now(), phone, purpose);

  db.prepare(
    `INSERT INTO otp_codes (phone, code_hash, purpose, expires_at, profile)
     VALUES (?, ?, ?, ?, ?)`
  ).run(phone, hashOtp(phone, code), purpose, expiresAt, profile ? JSON.stringify(profile) : null);

  // Deliver the code.
  let delivery = "log";
  if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
    try {
      await twilioClient.messages.create({
        body: `${process.env.OTP_MESSAGE_PREFIX || "NabhaCare"} verification code: ${code}. Valid for ${OTP_TTL_MINUTES} minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
      delivery = "sms";
    } catch (err) {
      console.error("❌ OTP SMS delivery failed:", err.message);
      delivery = "log";
    }
  }

  return { code, expiresAt, delivery, resendAfter: 0 };
}

/**
 * Verify a submitted code against the stored hash.
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
function verifyOtp(phone, purpose, code) {
  const row = db
    .prepare(
      `SELECT * FROM otp_codes
        WHERE phone = ? AND purpose = ? AND consumed_at IS NULL
        ORDER BY id DESC LIMIT 1`
    )
    .get(phone, purpose);

  if (!row) return { ok: false, reason: "No verification code was requested for this number." };

  if (Date.now() > row.expires_at) {
    db.prepare("UPDATE otp_codes SET consumed_at = ? WHERE id = ?").run(Date.now(), row.id);
    return { ok: false, reason: "That code has expired. Please request a new one." };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    db.prepare("UPDATE otp_codes SET consumed_at = ? WHERE id = ?").run(Date.now(), row.id);
    return {
      ok: false,
      reason: "Too many incorrect attempts. Please request a new code.",
    };
  }

  const expected = Buffer.from(row.code_hash);
  const actual = Buffer.from(hashOtp(phone, code));
  const matches =
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    const remaining = MAX_ATTEMPTS - (row.attempts + 1);
    return {
      ok: false,
      reason:
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Incorrect code. Please request a new one.",
    };
  }

  db.prepare("UPDATE otp_codes SET consumed_at = ? WHERE id = ?").run(Date.now(), row.id);
  let profile = null;
  try {
    profile = row.profile ? JSON.parse(row.profile) : null;
  } catch {
    profile = null;
  }
  return { ok: true, profile };
}

function purgeExpiredOtps() {
  db.prepare("DELETE FROM otp_codes WHERE expires_at < ?").run(Date.now() - 24 * 60 * 60 * 1000);
}

module.exports = {
  issueOtp,
  verifyOtp,
  hashOtp,
  secondsUntilResendAllowed,
  purgeExpiredOtps,
  twilioClient,
  DEV_EXPOSE_OTP,
  OTP_TTL_MINUTES,
};