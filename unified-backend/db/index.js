// Local SQLite data layer.
//
// The project originally targeted Supabase (see utils/supabase.js). Supabase is not
// reachable from this environment, so this module provides a self-contained local
// database with the same "table + query helper" shape so the rest of the codebase
// does not need to care which one is in use.
//
// The schema is created and migrated automatically on first require.

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH =
  process.env.DB_FILE ||
  path.join(__dirname, path.sep, "..", "data", "nabhacare.sqlite");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Migrations. Each entry runs once, in order, and is recorded in schema_migrations.
// ---------------------------------------------------------------------------
const migrations = [
  {
    id: "001_initial_schema",
    up: `
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        phone         TEXT    NOT NULL UNIQUE,
        role          TEXT    NOT NULL CHECK (role IN ('patient', 'doctor')),
        full_name     TEXT,
        age           INTEGER,
        address       TEXT,
        specialty     TEXT,              -- doctors only
        room          TEXT,              -- doctors only
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE otp_codes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        phone       TEXT    NOT NULL,
        code_hash   TEXT    NOT NULL,
        purpose     TEXT    NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 0,
        expires_at  INTEGER NOT NULL,
        profile     TEXT,              -- JSON, applied only after successful verification
        consumed_at INTEGER,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_otp_phone ON otp_codes (phone, purpose, consumed_at);

      CREATE TABLE login_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        phone        TEXT    NOT NULL,
        user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        role         TEXT,
        method       TEXT,
        success      INTEGER NOT NULL,
        ip_address   TEXT,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_login_events_phone ON login_events (phone, created_at);

      CREATE TABLE appointments (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_phone     TEXT    NOT NULL,
        patient_name      TEXT,
        patient_age       INTEGER,
        patient_condition TEXT,
        doctor_phone      TEXT,
        doctor_name       TEXT    NOT NULL,
        specialty         TEXT,
        date              TEXT    NOT NULL,
        time              TEXT    NOT NULL,
        consultation_type TEXT    NOT NULL,
        description       TEXT,
        status            TEXT    NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN ('scheduled', 'completed', 'cancelled')),
        created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_appt_patient ON appointments (patient_phone, date);
      CREATE INDEX idx_appt_doctor  ON appointments (doctor_phone, date);

      CREATE TABLE health_records (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_phone TEXT   NOT NULL,
        doctor_phone  TEXT,
        date          TEXT   NOT NULL,
        type          TEXT   NOT NULL
                       CHECK (type IN ('consultation', 'lab', 'xray',
                                       'prescription', 'vaccination', 'surgery')),
        title         TEXT   NOT NULL,
        description   TEXT,
        doctor_name   TEXT,
        facility      TEXT,
        created_at    TEXT   NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_records_patient ON health_records (patient_phone, date);

      CREATE TABLE symptom_checks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        phone        TEXT,
        symptoms     TEXT    NOT NULL,
        language     TEXT,
        is_emergency INTEGER NOT NULL DEFAULT 0,
        ai_response  TEXT,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE sos_alerts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        phone        TEXT,
        source       TEXT,          -- 'patient' | 'doctor'
        alert_type   TEXT,
        notes        TEXT,
        location     TEXT,
        sms_sid      TEXT,
        call_sid     TEXT,
        ip_address   TEXT,
        created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    CREATE INDEX idx_symptom_checks_phone ON symptom_checks (phone, created_at);
    `,
  },
  {
    id: "002_otp_profile_column",
    up: `
      ALTER TABLE otp_codes ADD COLUMN profile TEXT;
    `,
  },
];

function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
            id         TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`);

  const alreadyApplied = new Set(
    db.prepare("SELECT id FROM schema_migrations").all().map((r) => r.id)
  );

  const pending = migrations.filter((m) => !alreadyApplied.has(m.id));
  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.up);
      db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(migration.id);
    })();
    console.log(`📦 Applied migration ${migration.id}`);
  }

  if (pending.length === 0) {
    console.log("📦 Database schema up to date");
  }
}

runMigrations();

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------
const dbHelpers = {
  // --- users -------------------------------------------------------------
  findUserByPhone(phone) {
    return db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) || null;
  },

  findUserById(id) {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
  },

  listDoctors() {
    return db
      .prepare("SELECT * FROM users WHERE role = 'doctor' ORDER BY full_name")
      .all();
  },

  listPatients() {
    return db
      .prepare("SELECT * FROM users WHERE role = 'patient' ORDER BY full_name")
      .all();
  },

  upsertUser({ phone, role, full_name, age, address, specialty, room }) {
    db.prepare(
      `INSERT INTO users (phone, role, full_name, age, address, specialty, room)
       VALUES (@phone, @role, @full_name, @age, @address, @specialty, @room)
       ON CONFLICT(phone) DO UPDATE SET
         full_name = COALESCE(excluded.full_name, users.full_name),
         age       = COALESCE(excluded.age,       users.age),
         address   = COALESCE(excluded.address,   users.address),
         specialty = COALESCE(excluded.specialty, users.specialty),
         room      = COALESCE(excluded.room,      users.room)`
    ).run({
      phone,
      role,
      full_name: full_name ?? null,
      age: age ?? null,
      address: address ?? null,
      specialty: specialty ?? null,
      room: room ?? null,
    });

    return dbHelpers.findUserByPhone(phone);
  },

  updateUserProfile(phone, { full_name, age, address }) {
    db.prepare(
      `UPDATE users
          SET full_name = @full_name,
              age       = @age,
              address   = @address
        WHERE phone = @phone`
    ).run({
      phone,
      full_name: full_name ?? null,
      age: age === null || age === undefined || age === "" ? null : Number(age),
      address: address ?? null,
    });

    return dbHelpers.findUserByPhone(phone);
  },

  // --- login audit -------------------------------------------------------
  recordLoginEvent(event) {
    try {
      db.prepare(
        `INSERT INTO login_events (phone, user_id, role, method, success, ip_address)
         VALUES (@phone, @user_id, @role, @method, @success, @ip_address)`
      ).run({
        phone: event.phone,
        user_id: event.userId ?? null,
        role: event.role ?? null,
        method: event.method ?? null,
        success: event.success ? 1 : 0,
        ip_address: event.ipAddress ?? null,
      });
    } catch (error) {
      console.error("Error recording login event:", error.message);
    }
  },

  // --- appointments ------------------------------------------------------
  createAppointment(data) {
    const info = db
      .prepare(
        `INSERT INTO appointments
           (patient_phone, patient_name, patient_age, patient_condition,
            doctor_phone, doctor_name, specialty, date, time,
            consultation_type, description, status)
         VALUES
           (@patient_phone, @patient_name, @patient_age, @patient_condition,
            @doctor_phone, @doctor_name, @specialty, @date, @time,
            @consultation_type, @description, @status)`
      )
      .run(data);
    return dbHelpers.getAppointment(info.lastInsertRowid);
  },

  getAppointment(id) {
    return db.prepare("SELECT * FROM appointments WHERE id = ?").get(id) || null;
  },

  listAppointments({ patientPhone, doctorPhone }) {
    if (patientPhone) {
      return db
        .prepare(
          "SELECT * FROM appointments WHERE patient_phone = ? ORDER BY date, time"
        )
        .all(patientPhone);
    }
    if (doctorPhone) {
      return db
        .prepare(
          "SELECT * FROM appointments WHERE doctor_phone = ? ORDER BY date, time"
        )
        .all(doctorPhone);
    }
    return db.prepare("SELECT * FROM appointments ORDER BY date, time").all();
  },

  updateAppointment(id, patch) {
    const allowed = [
      "date",
      "time",
      "consultation_type",
      "description",
      "status",
      "doctor_name",
      "specialty",
    ];
    const keys = allowed.filter((k) => patch[k] !== undefined);
    if (keys.length === 0) return dbHelpers.getAppointment(id);

    const assignments = keys.map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE appointments SET ${assignments} WHERE id = @id`).run({
      id,
      ...Object.fromEntries(keys.map((k) => [k, patch[k]])),
    });
    return dbHelpers.getAppointment(id);
  },

  deleteAppointment(id) {
    return db.prepare("DELETE FROM appointments WHERE id = ?").run(id).changes > 0;
  },

  // --- health records ----------------------------------------------------
  createHealthRecord(record) {
    const info = db
      .prepare(
        `INSERT INTO health_records
           (patient_phone, doctor_phone, date, type, title, description,
            doctor_name, facility)
         VALUES
           (@patient_phone, @doctor_phone, @date, @type, @title, @description,
            @doctor_name, @facility)`
      )
      .run(record);
    return dbHelpers.getHealthRecord(info.lastInsertRowid);
  },

  getHealthRecord(id) {
    return db.prepare("SELECT * FROM health_records WHERE id = ?").get(id) || null;
  },

  listHealthRecords(patientPhone) {
    return db
      .prepare(
        "SELECT * FROM health_records WHERE patient_phone = ? ORDER BY date DESC, id DESC"
      )
      .all(patientPhone);
  },

  deleteHealthRecord(id) {
    return db.prepare("DELETE FROM health_records WHERE id = ?").run(id).changes > 0;
  },

  // --- symptom checks ----------------------------------------------------
  storeSymptomCheck(check) {
    const info = db
      .prepare(
        `INSERT INTO symptom_checks
           (phone, symptoms, language, is_emergency, ai_response)
         VALUES (@phone, @symptoms, @language, @is_emergency, @ai_response)`
      )
      .run({ ...check, is_emergency: check.is_emergency ? 1 : 0 });
    return db.prepare("SELECT * FROM symptom_checks WHERE id = ?").get(info.lastInsertRowid);
  },

  listSymptomChecks(phone) {
    return db
      .prepare(
        "SELECT * FROM symptom_checks WHERE phone = ? ORDER BY created_at DESC, id DESC LIMIT 50"
      )
      .all(phone);
  },

  // --- SOS alerts --------------------------------------------------------
  storeSOSAlert(alert) {
    const info = db
      .prepare(
        `INSERT INTO sos_alerts
           (phone, source, alert_type, notes, location, sms_sid, call_sid, ip_address)
         VALUES (@phone, @source, @alert_type, @notes, @location, @sms_sid, @call_sid, @ip_address)`
      )
      .run(alert);
    return db.prepare("SELECT * FROM sos_alerts WHERE id = ?").get(info.lastInsertRowid);
  },

  listSOSAlerts() {
    return db.prepare("SELECT * FROM sos_alerts ORDER BY created_at DESC, id DESC LIMIT 100").all();
  },

  // --- statistics --------------------------------------------------------
  statsForPhone(phone) {
    const row = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM appointments  WHERE patient_phone = ?) AS appointment_count,
           (SELECT COUNT(*) FROM health_records WHERE patient_phone = ?) AS record_count,
           (SELECT COUNT(*) FROM symptom_checks WHERE phone        = ?) AS symptom_check_count`
      )
      .get(phone, phone, phone);
    return row;
  },

  statsForDoctor(phone) {
    const row = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM appointments  WHERE doctor_phone = ?) AS appointment_count,
           (SELECT COUNT(*) FROM health_records WHERE doctor_phone = ?) AS record_count,
           (SELECT COUNT(*) FROM sos_alerts)                             AS sos_alert_count`
      )
      .get(phone, phone);
    return row;
  },
};

module.exports = { db, dbHelpers, DB_PATH };