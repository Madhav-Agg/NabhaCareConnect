/**
 * Stable, language-independent error codes.
 *
 * Previously every failure returned an English sentence, so the frontend could
 * only ever show that sentence — which left Hindi and Punjabi users reading
 * English errors. Routes now also return a `code`; the frontend maps codes to
 * localized messages via `src/lib/apiErrors.ts`, falling back to the server's
 * English text only when a code is unknown.
 *
 * Codes are additive: adding one does not change any existing response shape.
 */
const CODES = {
  // auth
  PHONE_REQUIRED: "Phone number is required.",
  PHONE_INVALID: "Enter a valid phone number in international format.",
  OTP_REQUIRED: "Phone number and verification code are required.",
  OTP_INVALID_FORMAT: "The verification code must be 6 digits.",
  OTP_NOT_REQUESTED: "No verification code was requested for this number.",
  OTP_EXPIRED: "That code has expired. Please request a new one.",
  OTP_INCORRECT: "Incorrect verification code.",
  OTP_ATTEMPTS_EXCEEDED: "Too many incorrect attempts. Please request a new code.",
  OTP_RATE_LIMITED: "Please wait before requesting another code.",
  DOCTOR_NOT_REGISTERED:
    "This number is not registered as a doctor. Ask an administrator to provision your account.",
  ROLE_MISMATCH: "This account belongs to a different panel.",
  UNAUTHENTICATED: "Authentication required. Please sign in.",
  SESSION_EXPIRED: "Your session has expired. Please sign in again.",
  SESSION_INVALID: "Invalid session. Please sign in again.",
  ACCOUNT_MISSING: "This account no longer exists.",
  FORBIDDEN: "You do not have permission to perform this action.",

  // validation
  INVALID_ID: "Invalid identifier.",
  INVALID_DATE: "Date must be in YYYY-MM-DD format.",
  INVALID_TIME: "Time must be in HH:MM format.",
  INVALID_AGE: "Age must be a whole number between 0 and 120.",
  NAME_REQUIRED: "Name cannot be empty.",
  FIELD_TOO_LONG: "That value is too long.",
  DOCTOR_REQUIRED: "Please choose a doctor.",
  DOCTOR_UNKNOWN: "That doctor is not registered on this platform.",
  CONSULTATION_TYPE_INVALID: "Unknown consultation type.",
  STATUS_INVALID: "Unknown appointment status.",
  TITLE_REQUIRED: "A title is required.",
  RECORD_TYPE_INVALID: "Unknown record type.",
  SYMPTOMS_REQUIRED: "Please describe your symptoms.",
  NOT_FOUND: "Not found.",

  // conflicts
  SLOT_TAKEN: "That time slot is already booked. Please choose another one.",
  ALREADY_COMPLETED: "A completed appointment cannot be deleted.",

  // integrations
  AI_UNAVAILABLE: "The AI service is unavailable.",
  TRANSLATION_UNAVAILABLE: "Translation is unavailable.",
  TWILIO_NOT_CONFIGURED: "Twilio is not configured on this server.",
  NO_RECIPIENTS: "No emergency recipients are configured.",
  TEXT_TOO_LONG: "The text is too long to translate.",
  LANGUAGE_UNSUPPORTED: "Unsupported target language.",
};

/** Convenience helper: `fail(res, 400, "OTP_EXPIRED")`. */
function fail(res, status, code, messageOverride) {
  return res.status(status).json({
    success: false,
    error: messageOverride || CODES[code] || "Request failed.",
    code,
  });
}

module.exports = { CODES, fail };