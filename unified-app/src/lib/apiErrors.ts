/**
 * Localizes server error messages.
 *
 * The backend returns both an English `error` string and a stable `code`. When
 * the code is one we recognise we render a translated message; otherwise we fall
 * back to the server's text, so a new backend error can never leave the user
 * staring at a blank alert.
 *
 * Keys live in the `apiErrors.*` namespace of the locale bundles.
 */

import type { TFunction } from "i18next";

import { ApiError } from "./api";

/** Backend error code → i18n key. Codes absent here fall back to `error`. */
const CODE_TO_KEY: Record<string, string> = {
  PHONE_REQUIRED: "apiErrors.phoneRequired",
  PHONE_INVALID: "apiErrors.phoneInvalid",
  OTP_REQUIRED: "apiErrors.otpRequired",
  OTP_INVALID_FORMAT: "apiErrors.otpInvalidFormat",
  OTP_NOT_REQUESTED: "apiErrors.otpNotRequested",
  OTP_EXPIRED: "apiErrors.otpExpired",
  OTP_INCORRECT: "apiErrors.otpIncorrect",
  OTP_ATTEMPTS_EXCEEDED: "apiErrors.otpAttemptsExceeded",
  OTP_RATE_LIMITED: "apiErrors.otpRateLimited",
  DOCTOR_NOT_REGISTERED: "apiErrors.doctorNotRegistered",
  ROLE_MISMATCH: "apiErrors.roleMismatch",
  UNAUTHENTICATED: "apiErrors.unauthenticated",
  SESSION_EXPIRED: "apiErrors.sessionExpired",
  SESSION_INVALID: "apiErrors.sessionInvalid",
  ACCOUNT_MISSING: "apiErrors.accountMissing",
  FORBIDDEN: "apiErrors.forbidden",
  INVALID_ID: "apiErrors.invalidId",
  INVALID_DATE: "apiErrors.invalidDate",
  INVALID_TIME: "apiErrors.invalidTime",
  INVALID_AGE: "apiErrors.invalidAge",
  NAME_REQUIRED: "apiErrors.nameRequired",
  FIELD_TOO_LONG: "apiErrors.fieldTooLong",
  DOCTOR_REQUIRED: "apiErrors.doctorRequired",
  DOCTOR_UNKNOWN: "apiErrors.doctorUnknown",
  CONSULTATION_TYPE_INVALID: "apiErrors.consultationTypeInvalid",
  STATUS_INVALID: "apiErrors.statusInvalid",
  TITLE_REQUIRED: "apiErrors.titleRequired",
  RECORD_TYPE_INVALID: "apiErrors.recordTypeInvalid",
  SYMPTOMS_REQUIRED: "apiErrors.symptomsRequired",
  NOT_FOUND: "apiErrors.notFound",
  SLOT_TAKEN: "apiErrors.slotTaken",
  ALREADY_COMPLETED: "apiErrors.alreadyCompleted",
  AI_UNAVAILABLE: "apiErrors.aiUnavailable",
  TRANSLATION_UNAVAILABLE: "apiErrors.translationUnavailable",
  TWILIO_NOT_CONFIGURED: "apiErrors.twilioNotConfigured",
  NO_RECIPIENTS: "apiErrors.noRecipients",
  TEXT_TOO_LONG: "apiErrors.textTooLong",
  LANGUAGE_UNSUPPORTED: "apiErrors.languageUnsupported",
};

/**
 * Returns a message in the active language for any thrown value.
 *
 * @param error    the caught value
 * @param t        the i18next translate function
 * @param fallback key used when the error is not an ApiError (e.g. a TypeError)
 */
export function localizedError(
  error: unknown,
  t: TFunction,
  fallbackKey = "errors.generic"
): string {
  if (error instanceof ApiError) {
    const key = error.code ? CODE_TO_KEY[error.code] : undefined;
    // `i18n.exists` guards against a code that has no entry yet, so the server's
    // own message is preferred over showing a raw key.
    if (key && t(key as never)) return t(key as never);
    return error.message;
  }
  return t(fallbackKey as never);
}

/** Exposed for tests and for the dev console. */
export const __CODE_TO_KEY = CODE_TO_KEY;