# NabhaCare Connect

A unified telemedicine platform for the Nabha area — one React application that
serves both a **doctor panel** and a **patient panel**, backed by an Express API
with a real database and server-enforced authorization.

```
NabhaCareConnect/
├── unified-app/       Frontend  — React 18 + TypeScript + Vite (port 3000)
└── unified-backend/   Backend   — Node + Express 5 + Socket.IO + SQLite (port 5000)
```

> **Redesign summary** — `REDESIGN-REPORT.md` documents the UI/UX redesign: the
> design system, how dark mode persists, every redesigned surface, the defects found
> while verifying it, and what remains open.

---

## Quick start

Two terminals. The backend must be running for the frontend to work.

```bash
# Terminal 1 — backend
cd unified-backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run seed                # one-time: creates the local database + demo accounts
npm start                   # http://localhost:5000

# Terminal 2 — frontend
cd unified-app
npm install
npm run dev                 # http://localhost:3000
```

Or install and seed both at once from the repository root:

```bash
npm run install:all
npm run seed:dev
npm run dev                 # starts backend + frontend together
```

### Demo accounts

The seed creates these accounts. **They have no passwords** — you sign in with the
same phone-number + one-time-code flow as any other user.

| Panel | Phone number | Name |
| --- | --- | --- |
| Doctor | `+919876500001` | Dr. Amrit Singh (General Medicine) |
| Doctor | `+919876500002` | Dr. Preet Kaur (Paediatrics) |
| Patient | `+919876500101` | Gurpreet Singh |
| Patient | `+919876500102` | Simran Kaur |

The one-time code is delivered by SMS. With no working Twilio number configured
it is logged by the backend and, because `DEV_EXPOSE_OTP=true` is set for local
development, shown in the sign-in screen itself.

> **Do not use `DEV_EXPOSE_OTP` outside local development.** The backend ignores
> it when `NODE_ENV=production` and logs a warning at startup when it is on.

---

## Verifying it works

```bash
# Backend: 41 API, authentication and authorization checks
cd unified-backend && npm test

# Frontend: types, lint, translations, contrast, production build
cd unified-app
npm run typecheck        # tsc --noEmit
npm run lint             # eslint (flat config, eslint.config.js)
npm run test:i18n        # 37 checks: key parity, plurals, Intl, fallback
node scripts/check-contrast.mjs   # 54 foreground/background pairs, light + dark
npm run build            # production bundle
```

The two end-to-end suites drive a real browser against both dev servers and need
Python plus Playwright:

```bash
cd unified-app
pip install playwright && python -m playwright install chromium
python e2e/signin-flow.py          # sign-in, booking, records, both panels
python e2e/localization-flow.py    # English / हिन्दी / ਪੰਜਾਬੀ switching
```

Screenshots from the browser runs are written to `unified-app/e2e-screenshots/`.
Everything they assert was also verified through a Playwright browser session
directly; see the redesign report for the per-check results.

---

## Architecture

### Authentication

Sign-in is a two-step one-time-code flow, enforced entirely by the backend.

1. `POST /api/{doctor|patient}/auth/send-otp` — generates a random 6-digit code,
   stores only a **salted SHA-256 hash** with a 5-minute expiry, and delivers it by
   SMS. Attempt counters and a 30-second resend cooldown limit brute forcing.
   Requesting a code does **not** create a database row.
2. `POST /api/{doctor|patient}/auth/verify-otp` — compares the submitted code
   against the stored hash using a constant-time comparison, consumes it, and
   returns a signed **JWT** plus the account.

Every protected route is guarded by `requireAuth()`, which re-reads the account
from the database on each request — so deleting or downgrading an account revokes
access immediately rather than at token expiry. The role is taken from the mount
path, so a patient token cannot reach `/api/doctor/*` and vice versa.

Doctors **cannot self-register**: `verify-otp` returns 403 unless a doctor record
already exists for that number. This is what actually protects the doctor panel.

### Data

Data lives in a local SQLite database (`unified-backend/data/nabhacare.sqlite`).
The schema is created and migrated automatically on first start and recorded in
`schema_migrations`, so upgrades are non-destructive.

Tables: `users`, `otp_codes`, `login_events`, `appointments`, `health_records`,
`symptom_checks`, `sos_alerts`.

The browser never talks to the database. Every read and write goes through the
API, where it is checked against the authenticated account.

### The frontend

All API traffic is relative and proxied to the backend by Vite in development, so
the app always talks to the origin it was served from. `src/lib/api.ts` is the
single place requests are made; it attaches the session token and normalises
errors. `src/lib/auth.tsx` restores and validates the session on load.

The dev proxy covers `/api` **and** `/socket.io` (upgrading WebSockets), so the
WebRTC signalling socket dials the same origin as the REST API and reaches the
backend while developing.

### Design system

One palette and one type scale are defined once — as CSS custom properties in
`unified-app/src/index.css` — and consumed through
`unified-app/tailwind.config.ts`. Components never hardcode a colour.

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | warm off-white paper | deep charcoal-slate |
| `--card` | white | raised slate |
| `--primary` | deep clinical teal | brightened teal |
| `--secondary` | soft mint | muted mint |
| `--foreground` | dark charcoal ink | warm white |
| `--muted-foreground` | muted ink | muted light ink |
| `--border` / `--input` | soft border | visible border |
| `--success` / `--warning` / `--destructive` | status colours | adjusted for dark surfaces |

Semantic tokens (`--background`, `--card`, `--primary`, `--secondary`, `--muted`,
`--border`, `--ring`, …) are the only colours written in component markup, and the
status pills are the shared `.status-*` classes. Type, motion, radii and the
reusable component classes (`.heading-page`, `.heading-section`, `.card-medical`,
`.btn-*`, `.touch-target`, `.app-container`, `.skip-link`, `.sr-only`) live in the
same stylesheet, so a page cannot drift from the scale.

Contrast is measured, not eyeballed:

```bash
cd unified-app && node scripts/check-contrast.mjs
```

It composites the translucent status pills over their real backgrounds and fails
if any pair drops below WCAG AA.

### Dark mode

The theme is hand-rolled in `unified-app/src/lib/theme.tsx`. No theming library is
involved, and there is exactly one source of truth:

- **Storage** — `localStorage` key `nabhacare.theme`, holding `"light"` or
  `"dark"`. Nothing else writes to it.
- **First visit** — with no stored value the app follows the operating system's
  `prefers-color-scheme`. That follow-the-OS state is not persisted, so a later
  change to the OS setting is still picked up.
- **No flash** — a short blocking script in `unified-app/index.html` reads the
  stored value (falling back to the OS preference) and sets `class="dark"` on
  `<html>` before the first paint. React then adopts that same state, so the boot
  script and the first render agree and there is no hydration mismatch.
- **Applying it** — `ThemeProvider` toggles a single class on `<html>`. Every
  colour is a token that already has a dark value, so no component needs a dark
  variant of its own — pages, dialogs, sheets, dropdowns, tables, toasts and
  loading skeletons all inherit it.
- **The control** — `components/layout/ThemeToggle.tsx` is a real `<button>`
  whose label names both the action and the current state ("Switch to dark mode" /
  "Switch to light mode"), operable with mouse, keyboard and touch, with a visible
  focus ring.


### Optional integrations

Each integration degrades honestly. If a credential is missing, the endpoint
returns a real error explaining what is unavailable — it never reports a
success it did not achieve.

| Feature | Needs | Without it |
| --- | --- | --- |
| SMS one-time codes | `TWILIO_*` | Codes are logged and shown in dev builds |
| SOS SMS + voice call | `TWILIO_*`, `SOS_RECIPIENT_NUMBERS` | Alert is still recorded and relayed to online doctors; response reports 503 |
| AI symptom checker / home remedies | `OPENROUTER_API_KEY` | Returns `503 AI_UNAVAILABLE`. Emergency guidance still works — it is served deterministically and never depends on the AI service |
| Email login alerts | `EMAIL_*`, `ALERT_EMAIL` | Alerts skipped |

---

## Configuration

`unified-backend/.env.example` documents every variable. The ones that matter:

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs sessions. Auto-generated into `data/.jwt-secret` if unset (development only). **Set this in production.** |
| `NODE_ENV` | `production` disables `DEV_EXPOSE_OTP` and blocks the seed script |
| `ALLOW_DEV_SEED` | Must be `true` for `npm run seed` to run |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API |
| `SOS_RECIPIENT_NUMBERS` | Who gets notified when an SOS alert is raised |
| `OPENROUTER_MODEL` | Optional; pins one model instead of the built-in fallback chain |

---

## Features

**Patient panel** — video consultation (WebRTC), appointment booking and history,
health records, medicine finder, AI symptom checker, home remedies, emergency
services, profile management.

**Doctor panel** — incoming call queue, appointment queue with status management,
patient records with record filing, ward-boy emergency alerts, dashboard statistics.

**Languages** — English, हिन्दी and ਪੰਜਾਬੀ, selectable on the first screen and
remembered thereafter.

---

## Localization

### How it works

The app uses **i18next** + **react-i18next** (already dependencies of the project).
Translations live in three JSON bundles and are compiled into the bundle at build
time, so there is no runtime fetch and no flash of untranslated text.

```
unified-app/src/locales/en.json   <- source of truth
unified-app/src/locales/hi.json
unified-app/src/locales/pa.json
unified-app/src/lib/i18n.ts       <- runtime: init, fallback, persistence, Intl locale
```

Components read strings with `useTranslation()` and never hold their own copy of a
translation:

```tsx
const { t } = useTranslation();
<h1>{t("patient.video.title")}</h1>
```

Keys are namespaced by feature — `common.*`, `language.*`, `panel.*`, `auth.*`,
`patientNav.*`, `doctor.*`, `patient.*`, `faq.*`, `apiErrors.*`.

### The language selector

`src/components/LanguageSelector.tsx` renders one button per supported language.
Clicking one calls `setLanguage()` in `lib/i18n.ts`, which:

1. calls `i18n.changeLanguage()` — every `useTranslation()` subscriber re-renders
   immediately, **with no page reload**;
2. persists the choice to `localStorage` under `nabhacare.language`;
3. updates `<html lang>` (via `lib/documentLanguage.ts`) to `en-IN` / `hi-IN` /
   `pa-IN`, so screen readers use the right pronunciation and `Intl` formatting
   matches the chosen language.

On the next visit i18n initialises from that stored value, so the selector is
skipped. The value is *only* written when the user actually chooses — a visitor
who has never picked a language still sees the selector, and English is not
silently persisted on their behalf.

### Missing keys

English is both the default and the fallback. A key present in `hi`/`pa` but not
`en` falls back to English. A key missing from every bundle is passed through
`parseMissingKeyHandler`, which renders the humanised final segment
(`patient.booking.save` -> "Save") rather than a dotted key. A `missingKey` listener
logs a warning in development builds.

### Dates, times and numbers

`src/lib/format.ts` formats through `Intl` using the active language's BCP-47 tag
rather than the browser's locale, so a Hindi user sees `24 दिसंबर 2026` on a
machine set to `en-US`. Parsing stays local-time throughout — no UTC shift that
would move a midnight appointment back a day.

### Long labels

Hindi and Punjabi labels run noticeably longer than English.
`src/styles/text-overflow.css` adds `.tile-label`, `.chip-label`, `.badge-inline`
and line-clamp helpers, and these are applied to nav tiles, filter chips, status
badges and card titles.

### Verifying translations

```bash
cd unified-app
npm run test:i18n       # key coverage, label-key integrity, plurals, Intl, fallback
npm run test:i18n:e2e   # live language switching in a real browser
```

- `scripts/check-translation-keys.mjs` — every `t("...")` in the source resolves,
  and `en`/`hi`/`pa` define identical key sets.
- `scripts/check-label-keys.mjs` — every `labelKey` in a nav-style config resolves.
  This exists because nav section ids and translation keys diverged
  (`appointments` vs `book`) and the missing-key handler rendered readable
  English instead of failing loudly.
- `scripts/verify-locales.mjs` — plural category selection, interpolation,
  English fallback, no empty strings, and BCP-47 date/time formatting.
- `e2e/localization-flow.py` — switching without reload, persistence,
  `<html lang>`, no raw keys rendered, no English-fallback nav tiles, and no
  horizontal overflow in Hindi or Punjabi.

### Translatable vs. not

Locale files only cover **UI chrome**. The following are data, not strings, and
are intentionally left as entered:

- patient and doctor names, addresses, ages
- doctor specialties and room numbers
- health-record titles and notes
- free-text appointment descriptions

For these the app provides a server-side translation endpoint:

```
POST /api/{doctor|patient}/translate
{ "text": "...", "targetLanguage": "hi" | "pa" | "en" }
-> { "success": true, "translated": "...", "targetLanguage": "hi" }
```

The provider credential stays in the server environment and is never shipped to
the browser. The endpoint requires a session, caps input length, and returns
`translated: null` with a code when the service is unavailable — it does not echo
the original text back as though it had been translated.

The AI symptom checker and home-remedies endpoints already take a `language`
parameter and answer in that language directly, which is the same mechanism
applied to generated content.

---

## API

All routes are prefixed with `/api` and require a bearer token unless noted.

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/health` | public |
| `POST` | `/api/{role}/auth/send-otp` | public |
| `POST` | `/api/{role}/auth/verify-otp` | public |
| `GET` | `/api/{role}/auth/me` | any |
| `POST` | `/api/{role}/auth/logout` | any |
| `GET` `PUT` | `/api/{role}/profile` | any |
| `GET` `POST` | `/api/{role}/appointments` | patient books; doctor reads their queue |
| `PATCH` `DELETE` | `/api/{role}/appointments/:id` | owner or treating doctor |
| `GET` `POST` | `/api/{role}/records` | patient reads own; doctor files for a patient |
| `DELETE` | `/api/{role}/records/:id` | owner or filing doctor |
| `GET` | `/api/doctor/dashboard`, `/api/doctor/patients` | doctor |
| `POST` | `/api/patient/symptoms/check-symptoms` | patient |
| `GET` | `/api/patient/symptoms/history` | patient |
| `POST` | `/api/patient/home-remedies/get-remedies` | patient |
| `POST` | `/api/{role}/sos` | any |
| `GET` | `/api/doctor/sos/alerts` | doctor |
| `POST` | `/api/patient/call/emergency` | any |
| `POST` | `/api/patient/sms/send`, `/send-sos` | any |
| `GET` | `/api/patient/pharmacies`, `/emergency-contacts` | any |
| `POST` | `/api/{role}/translate` | any |

---

## Security notes

- No credentials are committed. `.env` is git-ignored; only `.env.example` is tracked.
- One-time codes are stored hashed, expire in 5 minutes, are single-use, and are
  rate-limited by attempt count and resend cooldown.
- Authorization is enforced on the backend for every protected route. Hiding a
  button in the UI is never the control.
- The Socket.IO signaling channel requires the same JWT as the REST API, so a
  client cannot register as a doctor without a doctor account.
- Model output is rendered as React text, never as HTML.
- Doctor-supplied fields (name, specialty) are always read from the database, not
  from the request body.

---

## License

ISC