# ⚠️ Historical document — contains retired credentials

This file described an earlier Supabase + OpenRouter integration that has since
been replaced. It is kept only for context and **should not be used as setup
documentation**. See `../README.md` for current instructions.

The live API keys that were previously pasted into this file have been removed.
They were committed to source control and should be considered compromised and
rotated:

- the OpenRouter key (now set locally in `unified-backend/.env`)
- the Supabase project URL and anon key (no longer used by the app)

## What changed

| Area | Was | Now |
| --- | --- | --- |
| Database | Supabase REST, reached from the browser with a hardcoded anon key | Local SQLite via the backend; the browser never talks to the database directly |
| Appointments | Written client-side straight to Supabase, no owner, invisible to the doctor | Booked through `POST /api/patient/appointments`, scoped to the authenticated patient, visible in the doctor's queue |
| Authentication | Hardcoded backup OTP `123456` accepted for any number; no session token | Single-use hashed one-time codes, JWT sessions, role checks on every protected route |
| AI model | `x-ai/grok-4-fast:free`, retired by xAI (HTTP 404) | Configurable OpenRouter model with a verified fallback chain |
| AI failure mode | Returned fabricated advice with `success: true` | Returns `503 AI_UNAVAILABLE`; emergency guidance is served deterministically and never depends on the AI service |

## File map (current)

```
unified-backend/
├── db/index.js              SQLite schema, migrations, query helpers
├── middleware/auth.js       JWT signing/verification, requireAuth / optionalAuth
├── utils/otp.js             one-time code issue/verify, hashing, rate limiting
├── utils/ai.js              OpenRouter client with model fallback chain
├── controllers/             auth, call, sms
├── routes/                  auth, profile, appointments, records, doctor,
│                            symptoms, home-remedies, sos, call, sms, reference
├── reference/pharmacies.json
└── scripts/
    ├── seed-dev.js          guarded development seed
    ├── smoke-test.js        41 backend API/authorization checks
    └── cleanup-test-accounts.js
```