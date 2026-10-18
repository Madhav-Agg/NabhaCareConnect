# BharatCare Connect — Unified Backend

Express 5 API for the NabhaCare Connect platform: authentication, appointments,
health records, AI-assisted symptom triage, emergency dispatch and Socket.IO
signalling for WebRTC consultations.

## Requirements

- Node.js 20 or newer (developed on 22)
- npm 10+

## Setup

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run seed              # creates data/nabhacare.sqlite and the demo accounts
npm start
```

The server listens on `PORT` (default 5000) and prints the database path and the
available endpoints at startup.

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run with nodemon reload |
| `npm run seed` | Provision demo doctors/patients (dev-only, guarded) |
| `npm test` | 41 API / auth / authorization checks against a running server |

`npm test` and `npm run seed` both require the server or a fresh database
respectively; `npm test` expects `http://localhost:5000` unless `BASE_URL` is set.

## Layout

```
server.js              Express app, Socket.IO, CORS, error handling
db/index.js            SQLite connection, migrations, query helpers
middleware/auth.js     JWT signing/verification, requireAuth / optionalAuth
utils/otp.js           One-time code issue + verify (hashed, rate limited)
utils/ai.js            OpenRouter client with model fallback chain
utils/email.js         Nodemailer alerts
controllers/           auth, call, sms
routes/                auth, profile, appointments, records, doctor,
                       symptoms, home-remedies, sos, call, sms, reference
reference/             Static reference content (pharmacy directory)
scripts/               seed-dev, smoke-test, cleanup-test-accounts, normalise-env
```

## Environment

See `.env.example` for the full list. Nothing beyond `JWT_SECRET` is mandatory
for local development — missing integrations report honestly rather than
faking success.

| Variable | Required | Notes |
| --- | --- | --- |
| `JWT_SECRET` | production | Auto-generated into `data/.jwt-secret` in development |
| `NODE_ENV` | — | `production` disables `DEV_EXPOSE_OTP` and blocks the seed |
| `ALLOW_DEV_SEED` | dev | Must be `true` for `npm run seed` |
| `DB_FILE` | — | Defaults to `data/nabhacare.sqlite` |
| `CORS_ORIGINS` | — | Comma-separated; falls back to `FRONTEND_URL` |
| `SOS_RECIPIENT_NUMBERS` | for SOS | Without it, SOS returns 503 rather than pretending |
| `OPENROUTER_API_KEY` | for AI | Without it, AI endpoints return 503 |
| `TWILIO_*` | for SMS/voice | Without them, codes are logged and dispatch reports 503 |

## Security

- One-time codes are stored as salted SHA-256 hashes, expire after 5 minutes,
  are single-use, and are limited to 5 attempts with a 30-second resend cooldown.
- Every protected route re-reads the account from the database on each request.
- The role is derived from the mount path, so tokens cannot cross panels.
- Doctors cannot self-register; a doctor record must already exist.
- Socket.IO connections must present the same JWT as the REST API.

See the repository README for the full endpoint table.