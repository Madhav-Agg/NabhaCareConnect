// Guards against the "section id ≠ translation key" bug class.
//
// A nav tile is rendered as t(`namespace.${item.labelKey}`). If a tile's
// labelKey has no matching bundle entry, i18next's missing-key handler renders
// a readable humanised word — so the symptom is "one button is mysteriously in
// English", not a crash or a dotted key. That is easy to miss by eye.
//
// This script parses the `labelKey: "..."` entries out of each NAV_ITEMS-style
// array and asserts every one resolves in every bundle.
//
//   node scripts/check-label-keys.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGUAGES = ["en", "hi", "pa"];

function flatten(obj, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.add(full);
  }
  return out;
}

const bundles = Object.fromEntries(
  LANGUAGES.map((lng) => [
    lng,
    flatten(JSON.parse(fs.readFileSync(path.join(root, "src", "locales", `${lng}.json`), "utf8"))),
  ])
);

/** Finds `<namespace>` declarations of the form { key: "...", labelKey: "..." }. */
function findLabelKeyLists(source) {
  const results = [];
  const arrayRe = /const\s+(\w+)\s*(?::[^=]+)?=\s*\[([\s\S]*?)\n\]\s*(?:as\s+const\s*)?;/g;
  let m;
  while ((m = arrayRe.exec(source))) {
    const [, arrayName, body] = m;
    const namespace = body.match(/labelKey\s*:\s*"([a-zA-Z0-9_]+)"/) ? null : null;
    const entryRe = /\{\s*key\s*:\s*"([^"]+)"\s*,\s*labelKey\s*:\s*"([^"]+)"/g;
    const entries = [];
    let e;
    while ((e = entryRe.exec(body))) entries.push({ key: e[1], labelKey: e[2] });
    if (entries.length) {
      // The namespace is the one used in the render: t(`X.${item.labelKey}`).
      const render = source.match(/t\(`([a-zA-Z0-9_.]+)\.\$\{/);
      results.push({ arrayName, namespace: namespace || (render ? render[1] : null), entries });
    }
  }
  return results;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "ui" || entry.name === "locales") continue;
      walk(full, files);
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

let checked = 0;
const problems = [];

for (const file of walk(path.join(root, "src"))) {
  const source = fs.readFileSync(file, "utf8");
  for (const list of findLabelKeyLists(source)) {
    if (!list.namespace) continue;
    for (const { key, labelKey } of list.entries) {
      checked++;
      const full = `${list.namespace}.${labelKey}`;
      const missing = LANGUAGES.filter((lng) => !bundles[lng].has(full));
      if (missing.length) {
        problems.push(
          `${path.relative(root, file)}: ${list.arrayName} entry "${key}" → "${full}" is missing in ${missing.join(", ")}`
        );
      } else {
        // Also confirm the labelKey is not accidentally identical to the id in a
        // way that hides a missing key — informational only.
        if (key === labelKey) {
          // fine, but verify it really exists
          if (!bundles.en.has(full)) problems.push(`${file}: ${full} missing`);
        }
      }
    }
  }
}

// The language selector declares labelKeys too.
const selector = path.join(root, "src", "components", "LanguageSelector.tsx");
if (fs.existsSync(selector)) {
  const source = fs.readFileSync(selector, "utf8");
  const re = /labelKey\s*:\s*"([a-zA-Z0-9_]+)"/g;
  let m;
  while ((m = re.exec(source))) {
    checked++;
    const full = `language.${m[1]}`;
    const missing = LANGUAGES.filter((lng) => !bundles[lng].has(full));
    if (missing.length) {
      problems.push(`LanguageSelector.tsx: "${full}" is missing in ${missing.join(", ")}`);
    }
  }
}

console.log(`Label keys checked: ${checked}`);

if (problems.length) {
  console.log(`\nBROKEN LABEL KEYS (${problems.length}):`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log("✓ Every labelKey resolves in en, hi and pa.");