# NabhaCare Connect — UI/UX redesign report

A full redesign of the interface into one accessible, themable design system, built
directly into the existing codebase. No routes, permissions, API contracts, panel
structure or backend behaviour were replaced; the navigation model, the state-driven
panel architecture and every existing feature are preserved.

---

## 1. Design system

One visual language, defined once and consumed everywhere.

| Layer | Where | Contents |
| --- | --- | --- |
| Tokens | `unified-app/src/index.css` | `--background`, `--card`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`, `--foreground`, `--border`, `--input`, `--ring`, `--success`, `--warning`, `--destructive`, `--primary-hover`, `--radius`, motion durations/easings, `--font-sans` |
| Tailwind mapping | `unified-app/tailwind.config.ts` | the tokens as colours, `darkMode: ["class"]`, `ringOffsetColor.background`, two shadows, duration/easing tokens, `fade-in` keyframe |
| Shared classes | `unified-app/src/index.css` | `.heading-page`, `.heading-section`, `.heading-eyebrow`, `.text-body`, `.text-muted`, `.text-support`, `.app-container`, `.app-container-narrow`, `.surface-float`, `.card-medical`, `.status-*`, `.btn-*`, `.touch-target`, `.skip-link`, `.sr-only`, `.wash-hero`, `.rule-brand` |
| Primitives | `unified-app/src/components/ui/` | button, input, textarea, label, alert, badge, dialog, sheet, dropdown-menu, select, progress, skeleton, toast, toaster, sonner, tooltip, card |

**Palette — "Clinical Calm".** Light: warm off-white paper background, white cards,
deep clinical teal primary, soft mint secondary, charcoal ink, soft borders. Dark:
deep charcoal-slate background (not pure black), raised slate surfaces, a brightened
accessible teal, warm white ink, visible soft borders, status colours re-tuned for
dark surfaces. One 2 % teal wash on the first-run screen; no gradients, no
glassmorphism, no decorative effects.

**Type and shape.** A Windows-first font stack with Devanagari and Gurmukhi faces,
one heading/body/label/supporting scale, comfortable line heights, no text below
`0.75rem`, one spacing scale, one radius, one button height and one input height
(44 px on touch, 40 px on pointer devices).

**Contrast is measured, not eyeballed:** `scripts/check-contrast.mjs` composites the
translucent status pills over their real backgrounds and checks **54 pairs** — all
pass at AA.

---

## 2. Dark mode

Hand-rolled in `unified-app/src/lib/theme.tsx`; no theming library.

- **Storage:** `localStorage["nabhacare.theme"]` (`"light"` / `"dark"`).
- **First visit:** follows `prefers-color-scheme`. That choice is *not* persisted, so
  a later OS change is still honoured.
- **No flash:** a short blocking script in `unified-app/index.html` reads the stored
  value (or the OS preference) and puts `class="dark"` on `<html>` **before first
  paint**. React adopts the same value on mount, so the boot script and the first
  render agree — no hydration mismatch and no flash of the wrong theme. Verified with
  the class already present at `waitUntil: "commit"`.
- **Applying it:** one class on `<html>`; every colour is a token that already has a
  dark value, so pages, dialogs, sheets, dropdowns, tables, toasts, skeletons and
  loading states all inherit it without per-component dark variants.
- **Control:** `components/layout/ThemeToggle.tsx` — a real `<button>` labelled
  "Switch to dark mode" / "Switch to light mode" (naming both action and state),
  operable by mouse, keyboard and touch, with a visible focus ring.

---

## 3. Redesigned surfaces

**Shared chrome** — `AppHeader` (brand, language menu, theme toggle, account menu),
`AppFooter`, `EmptyState`, `SectionHeader`, `BrandLockup`, `LanguageMenu`,
`AccountMenu`, `ThemeToggle`, `ConfirmDialog`.

**First run and auth** — `LanguageSelector`, `PanelSelector`, `OTPLogin`, `App.tsx`
(skip link, session check, shell), `NotFound`.

**Patient panel** — `PatientPanel`, `HealthcareNav` (desktop tile row + mobile bottom
bar + "More" sheet), `VideoConsultSection`, `AppointmentBooking`, `AppointmentsList`,
`HealthRecords`, `MedicineFinderSection`, `SymptomChecker`, `HomeRemedies`,
`EmergencyServices`, `FAQButton`, `Profile`.

**Doctor panel** — `DoctorPanel`, `DoctorDashboard` (section switcher, stat tiles,
identity strip, SOS dialog), `AppointmentQueue`, `VideoCallSection`, `HealthRecords`,
`WardBoyEmergency`.

Preserved deliberately: the separate panel information architecture, the
state-driven section switching, the words in the `data-nav-item` /
`#doctor-tab-*` / `#phone` / `#otp` contract the automation relies on, and the
existing i18next architecture and storage keys.

---

## 4. Forms, states and accessibility

- Visible labels (never placeholder-only), logical grouping, correct input types,
  inline field errors, required fields marked, entered data preserved on failure,
  submit disabled while in flight with a pending state, one success/error surface per
  action, and a real confirmation dialog (focus-trapped, Escape-closable, labelled
  with the verb) in place of `window.confirm`.
- Loading skeletons, `aria-busy` on regions, live regions for async arrivals,
  explained empty states with the action that fills them, and inline destructive
  alerts.
- Moves at 140/200/320 ms on opacity/transform/colour; no hover `scale`; a
  `prefers-reduced-motion` block collapses motion to effectively zero; no critical
  action ever waits on an animation.
- Keyboard: skip link, one `<h1>` per view, `SectionHeader` as `<h2>`, focus moved to
  `<main tabindex="-1">` on section change, visible focus rings everywhere, Radix
  menus/dialogs fully keyboard operable, and `data-panel`/`aria-pressed` controls
  instead of clickable `div`s.
- Verified at 1440 / 1280 / 1024 / 820 / 768 / 390 / 320 px with no horizontal
  overflow, and in Hindi and Punjabi with no English leakage and no raw keys.

---

## 5. Defects found and fixed during verification

| Defect | Impact | Fix |
| --- | --- | --- |
| `server.js` did `const { jwt } = require("jsonwebtoken")`; the module has no `jwt` property | `jwt.verify` threw, the bare `catch` reported "Invalid or expired session token", so **every** Socket.IO connection was rejected and all WebRTC signalling was silently dead | `const jwt = require("jsonwebtoken")` |
| Vite proxied only `/api`, not `/socket.io` | The signalling socket (relative URL) never reached the backend in development | added a `/socket.io` proxy entry with `ws: true` |
| Patient appointment list grouped by date only | A **cancelled** future appointment was presented under the "Upcoming" heading while its own badge said "Cancelled" | cancelled appointments are grouped by status first, under a "Cancelled" heading |
| `initials()` counted a title as a name | The doctor's avatar read **DA** for "Dr. Amrit Singh" | honorifics are skipped: **AS** |
| Panel chooser CTAs misaligned | The two primary buttons sat 32 px apart because only one card had a footer note | both cards reserve the footer slot |

---

## 6. Verification performed

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0, no output |
| Translations | `npm run test:i18n` | 37 passed, 0 failed |
| Contrast | `node scripts/check-contrast.mjs` | all 54 pairs pass |
| Production build | `npm run build` | exit 0 — 1821 modules, 695 kB JS (208 kB gzip) |
| Backend | `unified-backend/npm test` | 41 passed, 0 failed |
| Backend cleanup | `npm run test:cleanup` | only the 4 seeded accounts remain |

**In a real browser** (Playwright, Chromium, live servers): a 68-check pass across
light/dark and desktop/tablet/mobile with **0 console errors and 0 page errors**; a
35-check replication of the localization suite covering the three languages, `<html
lang>`, persistence, no English leakage in Hindi/Punjabi, no raw keys, and no
horizontal overflow; and the full booking and cancellation journey — book → appears
in My Visits → dialog names the appointment, "Keep" preserves it, confirm cancels it.

The transformation is asserted, not assumed: the relationship between a 200 ms CSS
exit animation and a 5.9 s dialog close was measured with per-frame sampling and
traced to this instrumented browser running requestAnimationFrame at ~2 fps, not to a
stuck component.

---

## 7. Dependencies

**Added: none.** The redesign is built with what was already there.

**Removed: 33 unused packages** (including `next-themes`, `@supabase/supabase-js`,
`recharts`, `react-hook-form`, `zod`, `cmdk`, `date-fns`, `vaul`,
`react-resizable-panels` and 20 unused `@radix-ui/*` packages), plus 128 byte-duplicate
files in `components/doctor/ui/` and `components/patient/ui/` and 32 unused
`components/ui/` primitives. `tailwindcss-animate` was **kept** — the theme references
it. An `eslint.config.js` was added because `npm run lint` had no config at all under
ESLint 9.

---

## 8. Remaining issues and follow-ups

**Pre-existing, not caused by the redesign**

- `npm audit` reports **35 vulnerabilities (5 moderate, 30 high)** — unchanged in
  count by this work, and almost entirely in the build toolchain
  (eslint/typescript-eslint, tailwind, vite, rollup, postcss, glob, browserslist) plus
  `react-router-dom`, `socket.io-parser` and `ws`. Most have fixes available;
  `npm audit fix` (non-breaking) was not run because mass-upgrading the toolchain at
  the end of a redesign would need the whole verification set re-run.
- The doctor dashboard reports `Records: 0` while the patient directory shows
  "1 record" per patient — the dashboard counts records this doctor filed, the
  directory counts records about the patient. Backend semantics, untouched.
- 18 appointments left behind by earlier end-to-end runs (all the e2e booking
  signature: 10:30 / video / 2027) were removed from the local database; one older
  cancelled row was kept.
- 41 translation keys are defined but not referenced statically. They are kept: some
  are reached through dynamic keys (`doctor.stats*`, `panel.*.cta`, `errors.*`,
  plurals) and the guard calls them safe to keep.

**Could not be verified on this machine**

- `e2e/signin-flow.py` and `e2e/localization-flow.py` **could not be executed** — no
  Python runtime is available. They were changed only where the markup contract
  changed (`[data-panel='…']`, `[data-nav='desktop'] [data-nav-item='…']`, the
  account-menu `menuitem` logout), and every assertion they make was re-run by hand
  in a real browser; the updated selectors themselves remain unexecuted.
- Real two-party video: signalling now authenticates and connects (the backend logs
  the doctor and patient sockets registering), but a call between two authenticated
  browsers with media permissions was not performed.
- Twilio (account over its daily limit, and the configured US number cannot reach
  Indian numbers), OpenRouter's free tier (429s despite retry and fallback) and
  Supabase (unreachable from this network) remain unavailable, so SMS delivery and
  the AI endpoints could not be exercised end to end. All three degrade honestly.

---

## 9. Running it

```bash
cd unified-backend && npm start     # http://localhost:5000
cd unified-app     && npm run dev   # http://localhost:3000
```

Both are currently running. Demo accounts are one-time-code only:
doctors `+919876500001`, `+919876500002`; patients `+919876500101`,
`+919876500102`. With no working SMS number the code is logged and, because
`DEV_EXPOSE_OTP=true` is set locally, shown on the sign-in screen.
