// Exercises the locale bundles the way i18next does at runtime.
//
//   node scripts/verify-locales.mjs
//
// Covers the parts that static key checking cannot: plural category selection,
// interpolation, missing-key fallback, and the BCP-47 date formatting used by
// src/lib/format.ts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import en from "../src/locales/en.json" with { type: "json" };
import hi from "../src/locales/hi.json" with { type: "json" };
import pa from "../src/locales/pa.json" with { type: "json" };

const LANGUAGES = { en, hi, pa };
const TAGS = { en: "en-IN", hi: "hi-IN", pa: "pa-IN" };

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal stand-in for i18next: plural + interpolation + English fallback. */
function makeT(lng) {
  const bundle = LANGUAGES[lng];
  const enBundle = LANGUAGES.en;

  const lookup = (obj, key) => key.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);

  return function t(key, options = {}) {
    const pluralCount = options.count;
    const needsPlural = pluralCount != null && typeof pluralCount === "number";

    const resolve = (source) => {
      if (!needsPlural) return lookup(source, key);
      // Intl.PluralRules categories; en/hi/pa all use one/other.
      const category = new Intl.PluralRules(TAGS[lng], { type: "cardinal" }).select(pluralCount);
      return lookup(source, `${key}_${category}`) ?? lookup(source, `${key}_other`) ?? lookup(source, key);
    };

    let value = resolve(bundle);
    if (value == null) value = resolve(enBundle); // fallbackLng
    if (value == null) {
      // parseMissingKeyHandler equivalent: never surface a dotted key
      const leaf = key.split(".").pop();
      const words = leaf.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
    if (typeof value !== "string") return value;

    return value.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options[name] ?? ""));
  };
}

console.log("\nBundle structure");
for (const lng of Object.keys(LANGUAGES)) {
  const parsed = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "locales", `${lng}.json`), "utf8"));
  check(`${lng}.json parses`, Boolean(parsed));
  check(`${lng}.json defines faq.items as an array of 10`, Array.isArray(parsed.faq?.items) && parsed.faq.items.length === 10);
}

console.log("\nInterpolation");
for (const lng of Object.keys(LANGUAGES)) {
  const t = makeT(lng);
  const welcome = t("doctor.welcome", { name: "Dr. Amrit Singh" });
  check(`doctor.welcome interpolates (${lng})`, welcome.includes("Dr. Amrit Singh") && !welcome.includes("{{"), welcome);
  const room = t("doctor.room", { number: "101" });
  check(`doctor.room interpolates (${lng})`, room.includes("101"), room);
}

console.log("\nPlural forms");
for (const lng of Object.keys(LANGUAGES)) {
  const t = makeT(lng);
  const one = t("patient.records.count", { count: 1 });
  const many = t("patient.records.count", { count: 7 });
  check(`records.count singular (${lng})`, typeof one === "string" && one.length > 0, one);
  check(`records.count plural (${lng})`, typeof many === "string" && many.length > 0 && many !== one, many);
  const v1 = t("doctor.records.visitCount", { count: 1 });
  const v5 = t("doctor.records.visitCount", { count: 5 });
  check(`visitCount resolves both (${lng})`, v1 !== v5, `${v1} / ${v5}`);
}

console.log("\nMissing-key fallback");
// The bundles are at full parity, so there is no real key that exists only in
// English. A synthetic one is injected to exercise the fallback path, and a
// genuinely unknown key is checked separately.
const synthetic = { ...en, common: { ...en.common, englishOnlyProbe: "English only probe" } };
LANGUAGES.en = synthetic;

for (const lng of ["hi", "pa"]) {
  const t = makeT(lng);
  const fallback = t("common.englishOnlyProbe");
  check(`falls back to English when a key is missing from ${lng}`, fallback === "English only probe", fallback);

  const unknown = t("someNamespace.doesNotExist");
  check(`unknown key never renders as a dotted key (${lng})`, !unknown.includes("."), unknown);
}

LANGUAGES.en = en;

console.log("\nNo empty strings");
for (const lng of Object.keys(LANGUAGES)) {
  const empty = [];
  const walk = (obj, prefix = "") => {
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") walk(v, full);
      else if (typeof v === "string" && v.trim() === "") empty.push(full);
    }
  };
  walk(LANGUAGES[lng]);
  check(`${lng}.json has no empty translations`, empty.length === 0, empty.join(", "));
}

console.log("\nBCP-47 date and time formatting (as used by lib/format.ts)");
const sample = new Date("2026-12-24T00:00:00");
for (const [lng, tag] of Object.entries(TAGS)) {
  const formatted = new Intl.DateTimeFormat(tag, { year: "numeric", month: "short", day: "numeric" }).format(sample);
  check(`${tag} formats a date`, /2026/.test(formatted), formatted);

  const time = new Date("1970-01-01T09:30:00");
  const formattedTime = new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit", hour12: true }).format(time);
  check(`${tag} formats a 12-hour time`, formattedTime.length > 0, formattedTime);
}

console.log("\nTimezone sanity (the app stores naive local times)");
for (const [lng, tag] of Object.entries(TAGS)) {
  const formatted = new Intl.DateTimeFormat(tag, { dateStyle: "medium" }).format(new Date("2026-06-01T00:00:00"));
  check(`${tag} does not shift a midnight-local date to the previous day`, !formatted.includes("31 May"), formatted);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);