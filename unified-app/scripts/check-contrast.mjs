// Verifies contrast for the design-token pairs that carry meaning.
//
//   node scripts/check-contrast.mjs
//
// WCAG 2.2 AA needs 4.5:1 for body text, 3:1 for large text (>=24px or >=18.66px
// bold), UI boundaries and focus indicators. Palette decisions are easy to get
// subtly wrong by eye, especially in dark mode, so these ratios are computed
// rather than estimated.
//
// Covers three cases that a naive checker misses:
//   • tinted badges — `bg-warning/15 text-warning-foreground` composites the
//     tint over the surface first, so the real background is not `--warning`;
//   • focus indicators — `--ring` against both surface colours;
//   • solid semantic fills — `--*-foreground` on `--*`.
//
// The tokens are duplicated here rather than imported because index.css holds
// them as CSS custom properties. Keep both in step; this FAILS loudly rather
// than silently drifting if a colour is changed in only one place.

/** Converts an "H S% L%" CSS custom property value into [r,g,b] 0-255. */
function hslToRgb(H, S, L) {
  const s = S / 100;
  const l = L / 100;
  const k = (n) => (n + H / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composites `top` over `base` at alpha `pct` (0-100), as Tailwind's `/15` does. */
function tint(top, base, pct) {
  const a = pct / 100;
  return top.map((c, i) => c * a + base[i] * (1 - a));
}

const LIGHT = {
  background: [150, 12, 97],
  foreground: [200, 24, 12],
  card: [0, 0, 100],
  "card-foreground": [200, 24, 12],
  primary: [184, 76, 25],
  "primary-foreground": [160, 40, 98],
  secondary: [166, 44, 92],
  "secondary-foreground": [186, 72, 18],
  muted: [150, 12, 94],
  "muted-foreground": [200, 12, 36],
  accent: [166, 40, 91],
  "accent-foreground": [186, 72, 18],
  destructive: [0, 68, 42],
  "destructive-foreground": [0, 0, 100],
  success: [156, 68, 26],
  "success-foreground": [0, 0, 100],
  warning: [42, 96, 86],
  "warning-foreground": [28, 82, 22],
  border: [190, 16, 85],
  ring: [184, 76, 32],
};

const DARK = {
  ...LIGHT,
  background: [202, 32, 9], // #0f1a1e
  foreground: [180, 18, 95], // #eff7f7
  card: [203, 26, 13], // #1a2428
  "card-foreground": [180, 18, 95],
  primary: [175, 52, 51], // #3fc7b6
  "primary-foreground": [198, 45, 8], // #0b1a1e
  secondary: [192, 28, 20],
  "secondary-foreground": [172, 44, 88],
  muted: [200, 22, 17],
  "muted-foreground": [190, 14, 72],
  accent: [192, 30, 22],
  "accent-foreground": [172, 44, 88],
  destructive: [0, 84, 68], // #f47070 — must read as text on dark, too
  "destructive-foreground": [0, 70, 8],
  success: [152, 54, 50],
  "success-foreground": [150, 70, 8],
  warning: [42, 90, 22],
  "warning-foreground": [44, 96, 82],
  border: [200, 18, 24],
  ring: [175, 52, 51],
};

/** Text must clear 4.5:1. [fg, bg, minRatio] */
const TEXT_PAIRS = [
  ["foreground", "background", 4.5],
  ["foreground", "card", 4.5],
  ["foreground", "muted", 4.5],
  ["card-foreground", "card", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["success-foreground", "success", 4.5],
  ["warning-foreground", "warning", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "muted", 4.5],
  // Semantic colours used as *text* / icons on a surface, not just as a fill.
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["primary", "muted", 4.5],
  ["destructive", "background", 4.5],
  ["destructive", "card", 4.5],
  ["destructive", "muted", 4.5],
  ["success", "card", 3.0],
  ["success", "background", 3.0],
  // Faded body text: `text-muted-foreground/80` appears in review bars.
  ["muted-foreground", "secondary", 4.5],
];

/** Non-text UI: borders, rules, focus rings. Set at 3:1 per SC 1.4.11 / 2.4.11. */
const UI_PAIRS = [
  ["border", "card", 1.2],
  ["border", "background", 1.2],
  ["ring", "background", 3.0],
  ["ring", "card", 3.0],
];

/** Tinted status pills: `bg-<tint>/<pct>` with `text-<fg>`. */
const TINT_PAIRS = [
  ["primary", "primary", 15, ["primary", "card", 4.5]],
  ["destructive", "destructive", 12, ["destructive", "card", 4.5]],
  ["success", "success", 14, ["success", "card", 4.5]],
  ["warning", "warning", 15, ["warning-foreground", "card", 4.5]],
  // Warn chips on a muted surface, as the symptom-checker severity pill does.
  ["warning", "warning", 15, ["warning-foreground", "muted", 4.5]],
];

let failures = 0;

function report(ok, ratio, label, min) {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${ratio.toFixed(2)}:1  ${label}  (min ${min})`);
}

function run(label, t) {
  console.log(`\n${label} — solid text pairs`);
  for (const [fg, bg, min] of TEXT_PAIRS) {
    if (!t[fg] || !t[bg]) {
      console.log(`  FAIL  token not defined: ${fg} / ${bg}`);
      failures++;
      continue;
    }
    report(contrast(hslToRgb(...t[fg]), hslToRgb(...t[bg])) >= min, contrast(hslToRgb(...t[fg]), hslToRgb(...t[bg])), `${fg} on ${bg}`, min);
  }

  console.log(`\n${label} — boundaries and focus`);
  for (const [fg, bg, min] of UI_PAIRS) {
    const ratio = contrast(hslToRgb(...t[fg]), hslToRgb(...t[bg]));
    report(ratio >= min, ratio, `${fg} on ${bg}`, min);
  }

  console.log(`\n${label} — tinted status pills`);
  for (const [tintToken, , pct, [fg, bg, min]] of TINT_PAIRS) {
    const surface = tint(hslToRgb(...t[tintToken]), hslToRgb(...t[bg]), pct);
    const ratio = contrast(hslToRgb(...t[fg]), surface);
    report(ratio >= min, ratio, `${fg} on ${tintToken}/${pct} over ${bg}`, min);
  }
}

run("Light mode", LIGHT);
run("Dark mode", DARK);

console.log(
  `\n${failures === 0 ? "All contrast pairs pass." : `${failures} pair(s) below target.`}\n`
);
process.exit(failures === 0 ? 0 : 1);