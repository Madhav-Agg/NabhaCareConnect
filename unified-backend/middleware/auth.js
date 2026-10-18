// Authentication middleware + JWT helpers.
//
// Tokens are stateless HS256 JWTs signed with JWT_SECRET. On startup, if no secret
// is configured a random one is generated and cached in `data/.jwt-secret` so that
// development sessions survive a restart without ever hardcoding a secret.

require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const { dbHelpers } = require("../db");
const { fail } = require("../utils/errorCodes");

const TOKEN_TTL = process.env.JWT_EXPIRES_IN || "12h";
const SECRET_CACHE_FILE = path.join(__dirname, "..", "data", ".jwt-secret");

function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  try {
    if (fs.existsSync(SECRET_CACHE_FILE)) {
      const cached = fs.readFileSync(SECRET_CACHE_FILE, "utf8").trim();
      if (cached.length >= 32) return cached;
    }
  } catch {
    /* fall through to generation */
  }

  const generated = crypto.randomBytes(48).toString("hex");
  try {
    fs.mkdirSync(path.dirname(SECRET_CACHE_FILE), { recursive: true });
    fs.writeFileSync(SECRET_CACHE_FILE, generated, { mode: 0o600 });
    console.warn(
      "⚠️  JWT_SECRET is not set. Generated a development secret at " +
        "unified-backend/data/.jwt-secret — set JWT_SECRET in .env for production."
    );
  } catch (err) {
    console.warn(
      "⚠️  JWT_SECRET is not set and could not be cached; using an ephemeral secret."
    );
  }
  return generated;
}

const JWT_SECRET = resolveSecret();

/** Shape the frontend consumes; never leaks internal columns. */
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    phone: user.phone,
    role: user.role,
    name: user.full_name || null,
    age: user.age ?? null,
    address: user.address || null,
    specialty: user.specialty || null,
    room: user.room || null,
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), phone: user.phone, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL, issuer: "nabhacare-backend" }
  );
}

function readBearerToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

/**
 * Attaches req.user when a valid token is present. Never rejects.
 * Used by endpoints that work signed-in but degrade for anonymous users.
 */
function optionalAuth(req, _res, next) {
  const token = readBearerToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: "nabhacare-backend" });
    const user = dbHelpers.findUserById(Number(payload.sub));
    if (user) req.user = user;
  } catch {
    /* ignore invalid/expired tokens on optional routes */
  }
  next();
}

/**
 * Hard gate. Responds 401 when the request is not authenticated and 403 when the
 * token is valid but the role is wrong. This is the only thing that should ever
 * decide whether a protected resource is readable.
 */
function requireAuth(role) {
  return (req, res, next) => {
    const token = readBearerToken(req);
    if (!token) {
      return fail(res, 401, "UNAUTHENTICATED");
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET, { issuer: "nabhacare-backend" });
    } catch (err) {
      const expired = err.name === "TokenExpiredError";
      return fail(res, 401, expired ? "SESSION_EXPIRED" : "SESSION_INVALID");
    }

    // The user is re-read from the database on every request so that a deleted or
    // downgraded account loses access immediately instead of at token expiry.
    const user = dbHelpers.findUserById(Number(payload.sub));
    if (!user) {
      return fail(res, 401, "ACCOUNT_MISSING");
    }

    // When no explicit role is passed, enforce the role implied by the mount path
    // (e.g. a token issued under /api/patient/auth cannot call /api/doctor/auth/me).
    const expectedRole = role || (req.baseUrl?.includes("doctor") ? "doctor" : "patient");

    if (expectedRole && user.role !== expectedRole) {
      return fail(res, 403, "FORBIDDEN", `This endpoint is restricted to ${expectedRole} accounts.`);
    }

    req.user = user;
    req.token = token;
    next();
  };
}

module.exports = {
  requireAuth,
  optionalAuth,
  signToken,
  publicUser,
  TOKEN_TTL,
  JWT_SECRET,
};