/**
 * Date/time formatting helpers.
 *
 * The booking form previously did `new Date(selectedDate).toISOString().split('T')[0]`,
 * which converts to UTC — in IST an evening booking silently rolled back to the
 * previous day. These helpers stay in local time throughout.
 *
 * Formatting is locale-aware: dates render as "24 Dec 2026" in English,
 * "24 दिसंबर 2026" in Hindi and "24 ਦਸੰਬਰ 2026" in Punjabi, rather than following
 * whatever the browser's own locale happens to be.
 */

import { currentLocale } from "@/lib/i18n";

/** Local-calendar date as YYYY-MM-DD (never UTC-shifted). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayLocal(): string {
  return toLocalDateString(new Date());
}

/** Combines a YYYY-MM-DD date and an HH:MM time into a local Date. */
export function parseLocal(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [h, m] = time.split(":");
  const d = new Date(`${date}T00:00:00`);
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 24h HH:MM → locale-aware 12-hour time ("09:30 AM", "सुबह 9:30").
 *
 * Not hand-formatted with string concatenation: the Indic scripts have their own
 * day-period conventions that Intl already knows about.
 */
export function formatTime12(time: string): string {
  if (!TIME_12_RE.test(time)) return time;
  return new Intl.DateTimeFormat(currentLocale(), {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parseLocal("1970-01-01", time) ?? new Date());
}

/** Locale-aware grouping, e.g. 1200 → "1,200". */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(currentLocale()).format(value);
}

const TIME_12_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Start of today, local time. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDateLong(value: string | null | undefined): string {
  if (!value) return "—";
  // Bare YYYY-MM-DD must not be parsed as UTC midnight, or it renders a day early.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(currentLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export type AppointmentStatus = "upcoming" | "today" | "past";

export function appointmentStatus(date: string, time: string): AppointmentStatus {
  const when = parseLocal(date, time);
  if (!when) return "past";

  const today = startOfToday();
  const todayKey = toLocalDateString(today);

  if (date < todayKey) return "past";
  if (date > todayKey) return "upcoming";
  return when.getTime() < Date.now() ? "past" : "today";
}

/** Titles are not name parts, so they must not become initials. */
const HONORIFICS = new Set([
  "dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss",
  "prof", "prof.", "smt", "smt.", "shri", "shrimati",
]);

export function initials(name: string): string {
  const cleaned = (name || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(" ").filter(Boolean);
  // "Dr. Amrit Singh" reads as AS, not DA: honouring the title here produced an
  // avatar that announced the wrong initials for every doctor in the app.
  const named = parts.filter((part) => !HONORIFICS.has(part.toLowerCase()));
  const source = named.length > 0 ? named : parts;
  return source
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}