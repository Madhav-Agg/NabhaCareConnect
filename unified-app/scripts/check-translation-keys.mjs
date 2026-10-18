// Verifies that every translation key referenced in the source exists in all
// three locale bundles.
//
//   node scripts/check-translation-keys.mjs
//
// A key that resolves only in English is reported separately: that is a
// legitimate English-fallback case, but it still means a user in that language
// sees untranslated text, so it is worth surfacing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "src", "locales");
const srcDir = path.join(root, "src");

const LANGUAGES = ["en", "hi", "pa"];

/** Flattens nested JSON objects into dot-separated leaf paths. */
function flatten(obj, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, full, out);
    } else {
      out.add(full);
    }
  }
  return out;
}

const bundles = {};
for (const lng of LANGUAGES) {
  const file = path.join(localesDir, `${lng}.json`);
  bundles[lng] = flatten(JSON.parse(fs.readFileSync(file, "utf8")));
}

// Collect `t("...")` and `t("...{{x}}")` literals across the source tree.
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "ui" || entry.name === "locales") continue;
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const used = new Map(); // key -> [files]

const sourceFiles = walk(srcDir);

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  const re = /\bt\(\s*["'`]([a-zA-Z0-9_.\-]+)["'`]/g;
  let m;
  while ((m = re.exec(source))) {
    const key = m[1];
    if (!used.has(key)) used.set(key, []);
    used.get(key).push(path.relative(root, file));
  }
}

// src/lib/apiErrors.ts references keys indirectly, through the CODE_TO_KEY map,
// so a plain `t("...")` scan would miss them.
const apiErrorsFile = path.join(srcDir, "lib", "apiErrors.ts");
if (fs.existsSync(apiErrorsFile)) {
  const source = fs.readFileSync(apiErrorsFile, "utf8");
  const re = /"(apiErrors\.[a-zA-Z0-9_]+)"/g;
  let m;
  while ((m = re.exec(source))) {
    if (!used.has(m[1])) used.set(m[1], ["src/lib/apiErrors.ts"]);
  }
}

// Dynamic keys built from a template literal, e.g. t(`patientNav.${item.key}`).
const dynamic = new Map();
for (const file of walk(srcDir)) {
  const source = fs.readFileSync(file, "utf8");
  const re = /\bt\(\s*`([^`$]+)\$\{/g;
  let m;
  while ((m = re.exec(source))) {
    const prefix = m[1];
    if (!dynamic.has(prefix)) dynamic.set(prefix, []);
    dynamic.get(prefix).push(path.relative(root, file));
  }
}

const missingEverywhere = [];
const missingPerLanguage = { en: [], hi: [], pa: [] };

for (const [key, files] of used) {
  const present = LANGUAGES.filter((lng) => bundles[lng].has(key));
  if (present.length === 0) {
    missingEverywhere.push([key, files[0]]);
  } else {
    for (const lng of LANGUAGES) {
      if (!bundles[lng].has(key)) missingPerLanguage[lng].push(key);
    }
  }
}

// Keys used inside a template literal must be resolvable as a prefix.
const badDynamic = [];
for (const [prefix, files] of dynamic) {
  const ok = LANGUAGES.some((lng) =>
    [...bundles[lng]].some((key) => key.startsWith(prefix))
  );
  if (!ok) badDynamic.push([prefix, files[0]]);
}

// Keys that exist in a bundle but are never referenced.
const referenced = new Set(used.keys());
const orphans = [];
for (const key of bundles.en) {
  if (referenced.has(key)) continue;
  if ([...dynamic.keys()].some((p) => key.startsWith(p))) continue;
  orphans.push(key);
}

console.log(`Static keys referenced : ${used.size}`);
console.log(`Dynamic key prefixes   : ${dynamic.size}`);
console.log(`Bundle keys (en)       : ${bundles.en.size}`);

let exitCode = 0;

if (missingEverywhere.length) {
  exitCode = 1;
  console.log(`\nMISSING IN EVERY BUNDLE (${missingEverywhere.length}):`);
  for (const [key, file] of missingEverywhere) console.log(`  ${key}  (${file})`);
} else {
  console.log("\n✓ Every referenced key resolves in at least one bundle.");
}

if (badDynamic.length) {
  exitCode = 1;
  console.log(`\nBAD DYNAMIC PREFIXES (${badDynamic.length}):`);
  for (const [prefix, file] of badDynamic) console.log(`  ${prefix}*  (${file})`);
}

const partial = LANGUAGES.filter((lng) => missingPerLanguage[lng].length > 0);
if (partial.length) {
  console.log(`\nKeys relying on English fallback (${partial.length} languages):`);
  for (const lng of partial) {
    console.log(`  ${lng}: ${missingPerLanguage[lng].length}`);
    for (const key of missingPerLanguage[lng]) console.log(`    - ${key}`);
  }
} else {
  console.log("✓ Full parity: en / hi / pa all define the same keys.");
}

if (orphans.length) {
  console.log(`\nUnused bundle keys (${orphans.length}) — safe to keep, but unused:`);
  for (const key of orphans) console.log(`  ${key}`);
}

process.exit(exitCode);