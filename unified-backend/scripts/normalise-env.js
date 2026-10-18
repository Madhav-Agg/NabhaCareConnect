// One-off maintenance script: normalise unified-backend/.env.
// Removes keys that are no longer read and appends the auth/database settings.
// Existing secrets are preserved untouched and never printed.
const fs = require("fs");
const crypto = require("crypto");

const envPath = require("path").join(__dirname, "..", ".env");

const REMOVED_KEYS = new Set([
  "BACKUP_OTP", // universal bypass OTP — deleted
  "BACKUP_ON_TWILIO_ERROR",
  "DEV_EXPOSE_OTP", // re-added below with a guard
  "VITE_SIGNALING_URL", // frontend-only variable, wrong here
  "NODE_ENV",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "OTP_TTL_MINUTES",
  "OTP_MAX_ATTEMPTS",
  "OTP_RESEND_COOLDOWN_SECONDS",
  "ALLOW_DEV_SEED",
  "SOS_RECIPIENT_NUMBERS",
  "EMERGENCY_CALL_NUMBER",
  "OPENROUTER_MODEL",
  "CORS_ORIGINS",
]);

const existingSecret = (() => {
  try {
    const line = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((l) => /^\s*JWT_SECRET\s*=/.test(l));
    return line ? line.split("=").slice(1).join("=").trim() : "";
  } catch {
    return "";
  }
})();

const lines = fs
  .readFileSync(envPath, "utf8")
  .split(/\r?\n/)
  .filter((l) => {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return !m || !REMOVED_KEYS.has(m[1]);
  });

while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

const jwtSecret = existingSecret || crypto.randomBytes(48).toString("hex");

lines.push(
  "",
  "# ---------------------------------------------------------------------------",
  "# Local development setup — authentication, database and AI configuration",
  "# ---------------------------------------------------------------------------",
  "NODE_ENV=development",
  "",
  "# Signs session JWTs. Rotating it invalidates every active session.",
  `JWT_SECRET=${jwtSecret}`,
  "JWT_EXPIRES_IN=12h",
  "",
  "# One-time-code policy",
  "OTP_TTL_MINUTES=5",
  "OTP_MAX_ATTEMPTS=5",
  "OTP_RESEND_COOLDOWN_SECONDS=30",
  "",
  "# Local development only. When true, the one-time code is returned in the",
  "# send-otp response so login works without an SMS gateway.",
  "# The backend refuses to honour this when NODE_ENV=production.",
  "DEV_EXPOSE_OTP=true",
  "",
  "# Guard for scripts/seed-dev.js. Must be true before the seed will run.",
  "ALLOW_DEV_SEED=true",
  "",
  "# Numbers notified when an SOS alert is raised (comma separated).",
  "# SOS dispatch requires at least one recipient.",
  "SOS_RECIPIENT_NUMBERS=+919876500001",
  "EMERGENCY_CALL_NUMBER=112",
  "",
  "# AI symptom checker model (OpenRouter). The previously hardcoded",
  "# x-ai/grok-4-fast:free has been retired and returns 404.",
  "OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free",
  "",
  "# Browser origins permitted to call this API.",
  "CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000"
);

fs.writeFileSync(envPath, lines.join("\n") + "\n");

const keys = fs
  .readFileSync(envPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/))
  .filter(Boolean)
  .map((m) => m[1]);

console.log("unified-backend/.env normalised.");
console.log("Keys now present:", keys.join(", "));
const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
console.log("Duplicate keys:", dupes.length ? dupes.join(", ") : "none");