// BharatCare Connect — unified backend (Express + Socket.IO + SQLite).

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
// `jsonwebtoken` exports `sign`/`verify`/`decode` as the module itself — it has no
// `jwt` property. Destructuring one (`const { jwt } = require("jsonwebtoken")`)
// left `jwt` undefined, so the socket middleware's `jwt.verify` threw a TypeError
// that its bare `catch` reported as "Invalid or expired session token". Every
// socket connection was rejected, which silently disabled all WebRTC signalling.
const jwt = require("jsonwebtoken");

const { DB_PATH } = require("./db");
const { purgeExpiredOtps } = require("./utils/otp");
const { JWT_SECRET } = require("./middleware/auth");

const app = express();
const httpServer = http.createServer(app);

// --- CORS ------------------------------------------------------------------
// In development the Vite dev server runs on :3000 and may be reached over the LAN
// (host: true), so the origin list is configurable instead of "*".
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / curl / server-to-server requests have no Origin header.
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

// --- Socket.IO -------------------------------------------------------------
const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true, methods: ["GET", "POST"] },
});
app.set("io", io);

// --- Routes ---------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({
    status: "OK",
    message: "BharatCare Connect Unified Backend is running",
    database: DB_PATH,
    timestamp: new Date().toISOString(),
  });
});

// Doctor panel
app.use("/api/doctor/auth", require("./routes/auth"));
app.use("/api/doctor/sos", require("./routes/sos"));
app.use("/api/doctor/profile", require("./routes/profile"));
app.use("/api/doctor/appointments", require("./routes/appointments"));
app.use("/api/doctor/records", require("./routes/records"));
app.use("/api/doctor", require("./routes/doctor"));

// Patient panel
app.use("/api/patient/auth", require("./routes/auth"));
app.use("/api/patient/sos", require("./routes/sos"));
app.use("/api/patient/profile", require("./routes/profile"));
app.use("/api/patient/appointments", require("./routes/appointments"));
app.use("/api/patient/records", require("./routes/records"));
app.use("/api/patient/symptoms", require("./routes/symptoms"));
app.use("/api/patient/home-remedies", require("./routes/home-remedies"));
app.use("/api/patient/call", require("./routes/call"));
app.use("/api/patient/sms", require("./routes/sms"));
app.use("/api/patient", require("./routes/reference"));

// Translation of dynamic, user-entered content. Registered under both panels
// because both doctors and patients author records.
app.use("/api/doctor/translate", require("./routes/translate"));
app.use("/api/patient/translate", require("./routes/translate"));

// Unscoped aliases for the shared auth + profile endpoints.
app.use("/api/auth", require("./routes/auth"));
app.use("/api/sos", require("./routes/sos"));

app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, error: "API endpoint not found." });
});

// --- Socket.IO WebRTC signaling ------------------------------------------
// Sockets must present the same JWT that the REST API issued; previously anyone
// could connect and register as "doctor", which is how the signaling channel was
// effectively unauthenticated.
const socketRoles = new Map(); // socket.id -> { role, userId }

io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer /, "");
  if (!token) return next(new Error("Authentication required"));

  try {
    const payload = jwt.verify(token, JWT_SECRET, { issuer: "nabhacare-backend" });
    socket.data.user = { id: Number(payload.sub), phone: payload.phone, role: payload.role };
    next();
  } catch {
    next(new Error("Invalid or expired session token"));
  }
});

io.on("connection", (socket) => {
  const { id, phone, role } = socket.data.user;
  console.log(`🔌 Socket connected: ${socket.id} (${role} ${phone})`);

  socket.join(`role:${role}`);
  socketRoles.set(socket.id, { role, userId: id });

  // The patient targets a specific doctor; the legacy broadcast is kept as a fallback.
  socket.on("call-user", (payload = {}) => {
    const targetDoctor = payload.doctorPhone
      ? [...io.sockets.sockets.values()].filter(
          (s) => s.data.user?.role === "doctor" && s.data.user.phone === payload.doctorPhone
        )
      : [];

    if (targetDoctor.length > 0) {
      targetDoctor.forEach((s) =>
        s.emit("incoming-call", { from: socket.id, fromPhone: phone, ...payload })
      );
    } else {
      io.to("role:doctor").emit("incoming-call", {
        from: socket.id,
        fromPhone: phone,
        ...payload,
      });
    }
  });

  socket.on("accept-call", ({ to } = {}) => {
    if (to) io.to(to).emit("call-accepted", { from: socket.id });
  });

  socket.on("reject-call", ({ to, reason } = {}) => {
    if (to) io.to(to).emit("call-rejected", { from: socket.id, reason: reason || "rejected" });
  });

  socket.on("offer", ({ to, sdp } = {}) => {
    if (to) io.to(to).emit("offer", { from: socket.id, sdp });
  });

  socket.on("answer", ({ to, sdp } = {}) => {
    if (to) io.to(to).emit("answer", { from: socket.id, sdp });
  });

  socket.on("ice-candidate", ({ to, candidate } = {}) => {
    if (to) io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("end-call", ({ to } = {}) => {
    if (to) io.to(to).emit("end-call", { from: socket.id });
  });

  socket.on("disconnect", () => {
    socketRoles.delete(socket.id);
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// --- Error handling --------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.statusCode || (err.message?.includes("not allowed by CORS") ? 403 : 500);
  if (status >= 500) console.error("❌ Unhandled error:", err);
  res.status(status).json({
    success: false,
    error: status >= 500 && !err.statusCode ? "Internal server error." : err.message,
  });
});

// --- Start -----------------------------------------------------------------
const PORT = process.env.PORT || 5000;

setInterval(purgeExpiredOtps, 60 * 60 * 1000).unref();

httpServer.listen(PORT, () => {
  console.log(`✅ BharatCare Connect backend running on http://localhost:${PORT}`);
  console.log(`   Database: ${DB_PATH}`);
  console.log(`   Auth:     POST /api/{doctor|patient}/auth/{send-otp,verify-otp}`);
  console.log(`   Health:   GET  /health`);
});

module.exports = { app, io };