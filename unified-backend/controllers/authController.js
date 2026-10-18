// Authentication controller: OTP login, session info, logout.
//
// The previous implementation accepted a hardcoded "backup OTP" (123456) for any
// phone number regardless of whether a code had ever been sent, and returned
// success without issuing any session token. There was no server-side
// authorization anywhere in the app. Both are fixed here.

require("dotenv").config();

const { fail } = require("../utils/errorCodes");

const { dbHelpers } = require("../db");
const { issueOtp, verifyOtp, DEV_EXPOSE_OTP, OTP_TTL_MINUTES } = require("../utils/otp");
const { signToken, publicUser } = require("../middleware/auth");

const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const OTP_REGEX = /^\d{6}$/;
const ROLES = new Set(["patient", "doctor"]);

function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  const stripped = raw.trim().replace(/[\s\-()]/g, "");
  if (stripped.startsWith("00")) return `+${stripped.slice(2)}`;
  if (/^\d{10}$/.test(stripped)) return `+91${stripped}`; // assume India by default
  if (/^\d{11}$/.test(stripped) && stripped.startsWith("0")) return `+${stripped.slice(1)}`;
  return stripped;
}

/**
 * Maps the human-readable reason from utils/otp.js onto a stable code so the
 * frontend can render a localized message. The reason text is still returned
 * as `error` for clients that do not know about codes.
 */
function otpFailureCode(reason) {
  if (/expired/i.test(reason)) return "OTP_EXPIRED";
  if (/no verification code/i.test(reason)) return "OTP_NOT_REQUESTED";
  if (/too many/i.test(reason)) return "OTP_ATTEMPTS_EXCEEDED";
  return "OTP_INCORRECT";
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

/** The role is taken from the mount path (/api/doctor/auth vs /api/patient/auth). */
function roleFor(req) {
  const fromPath = req.baseUrl.includes("doctor") ? "doctor" : "patient";
  return ROLES.has(fromPath) ? fromPath : "patient";
}

/**
 * POST /api/{role}/auth/send-otp
 * Body: { phone, fullName?, age?, address? }
 */
exports.sendOtp = async (req, res, next) => {
  try {
    const role = roleFor(req);
    const phone = normalizePhone(req.body?.phone);

    if (!phone) {
      return fail(res, 400, "PHONE_REQUIRED");
    }
    if (!PHONE_REGEX.test(phone)) {
      return fail(res, 400, "PHONE_INVALID");
    }

    // Profile details are carried alongside the pending code and only written to
    // the users table once the code is verified. Creating the account now would
    // let anyone able to trigger an SMS insert unlimited rows.
    const profile =
      role === "patient" && !dbHelpers.findUserByPhone(phone)
        ? {
            full_name: req.body?.fullName || null,
            age: req.body?.age ? Number(req.body.age) : null,
            address: req.body?.address || null,
          }
        : null;

    const { code, delivery } = await issueOtp(phone, role, profile);

    if (delivery === "log") {
      console.log(`[OTP] ${phone} (${role}) → ${code}  [delivery: no Twilio configured]`);
    }

    return res.json({
      success: true,
      role,
      // Only ever populated in non-production development builds.
      ...(DEV_EXPOSE_OTP ? { devOtp: code } : {}),
      delivery,
      expiresInMinutes: OTP_TTL_MINUTES,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    return next(err);
  }
};

/**
 * POST /api/{role}/auth/verify-otp
 * Body: { phone, otp }
 * Returns a signed JWT plus the authenticated user.
 */
exports.verifyOtp = async (req, res, next) => {
  const role = roleFor(req);
  const phone = normalizePhone(req.body?.phone);
  const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";

  if (!phone || !otp) {
    return fail(res, 400, "OTP_REQUIRED");
  }
  if (!PHONE_REGEX.test(phone)) {
    return fail(res, 400, "PHONE_INVALID");
  }
  if (!OTP_REGEX.test(otp)) {
    return fail(res, 400, "OTP_INVALID_FORMAT");
  }

  const result = verifyOtp(phone, role, otp);

  if (!result.ok) {
    dbHelpers.recordLoginEvent({
      phone,
      role,
      method: "otp",
      success: false,
      ipAddress: clientIp(req),
    });
    return fail(res, 401, otpFailureCode(result.reason), result.reason);
  }

  let user = dbHelpers.findUserByPhone(phone);

  if (!user) {
    if (role === "doctor") {
      // Doctors cannot self-register: a doctor record must be provisioned by an
      // administrator. This is what actually protects the doctor panel.
      dbHelpers.recordLoginEvent({
        phone,
        role,
        method: "otp",
        success: false,
        ipAddress: clientIp(req),
      });
      return fail(res, 403, "DOCTOR_NOT_REGISTERED");
    }
    user = dbHelpers.upsertUser({ phone, role: "patient", ...(result.profile || {}) });
  }

  if (user.role !== role) {
    dbHelpers.recordLoginEvent({
      phone,
      userId: user.id,
      role: user.role,
      method: "otp",
      success: false,
      ipAddress: clientIp(req),
    });
    return fail(res, 403, "ROLE_MISMATCH", `This account is registered as a ${user.role}. Switch panels to continue.`);
  }

  dbHelpers.recordLoginEvent({
    phone,
    userId: user.id,
    role: user.role,
    method: "otp",
    success: true,
    ipAddress: clientIp(req),
  });

  return res.json({
    success: true,
    verified: true,
    token: signToken(user),
    user: publicUser(user),
  });
};

/** GET /api/{role}/auth/me — used on page refresh to re-hydrate the session. */
exports.me = (req, res) => {
  return res.json({ success: true, user: publicUser(req.user) });
};

/**
 * POST /api/{role}/auth/logout
 * Tokens are stateless, so logout is a client-side token discard. This endpoint
 * exists so the audit trail records the event and so clients have a single
 * well-defined logout call.
 */
exports.logout = (req, res) => {
  dbHelpers.recordLoginEvent({
    phone: req.user.phone,
    userId: req.user.id,
    role: req.user.role,
    method: "logout",
    success: true,
    ipAddress: clientIp(req),
  });
  return res.json({ success: true });
};

exports.normalizePhone = normalizePhone;