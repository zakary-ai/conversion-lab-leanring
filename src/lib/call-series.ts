/**
 * Pure rule engine for recurring live calls. No database access.
 *
 * A series rule is weekly: on `daysOfWeek` (0 = Sunday), every
 * `intervalWeeks`, at `startMinute` past midnight in `timezone`, on calendar
 * dates from `startsOn` through `endsOn` (inclusive, "YYYY-MM-DD" in that
 * zone). Occurrences are UTC instants computed with the DST-aware zone math
 * from ./booking, so "every Tuesday at 7 PM" stays 7 PM across a DST change.
 *
 * Series are bounded on purpose: every occurrence is created up front (and
 * mirrored as one Zoom recurring meeting), so nothing has to run in the
 * background to keep the calendar filled.
 */
import { DAY_NAMES, zonedTimeToUtc } from "./booking";
import { zoneCity } from "./timezone";

export const MAX_SERIES_OCCURRENCES = 52;
export const MAX_SERIES_SPAN_DAYS = 366;
export const MAX_INTERVAL_WEEKS = 8;
export const DEFAULT_SERIES_WEEKS = 12;

export type SeriesRule = {
  timezone: string;
  daysOfWeek: number[];
  intervalWeeks: number;
  startMinute: number;
  startsOn: string;
  endsOn: string;
};

const DAY = 24 * 60 * 60 * 1000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isYmd(s: string): boolean {
  const m = YMD.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Days since the epoch for a calendar date — zone-free arithmetic for stepping days. */
function ymdToIndex(ymd: string): number {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Bad date: ${ymd}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY);
}

function indexToParts(i: number) {
  const dt = new Date(i * DAY);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), weekday: dt.getUTCDay() };
}

export function addDaysYmd(ymd: string, days: number): string {
  const p = indexToParts(ymdToIndex(ymd) + days);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function weekdayOfYmd(ymd: string): number {
  return indexToParts(ymdToIndex(ymd)).weekday;
}

/** Every occurrence of the rule as a UTC instant, sorted, capped at MAX_SERIES_OCCURRENCES. */
export function seriesOccurrences(rule: SeriesRule): Date[] {
  const start = ymdToIndex(rule.startsOn);
  const end = ymdToIndex(rule.endsOn);
  // Weeks are counted from the Sunday on or before the first date.
  const anchor = start - indexToParts(start).weekday;
  const days = new Set(rule.daysOfWeek);
  const interval = Math.max(1, rule.intervalWeeks);
  const out: Date[] = [];
  for (let i = start; i <= end && out.length < MAX_SERIES_OCCURRENCES; i++) {
    const p = indexToParts(i);
    if (!days.has(p.weekday)) continue;
    if (Math.floor((i - anchor) / 7) % interval !== 0) continue;
    out.push(zonedTimeToUtc(rule.timezone, p.year, p.month, p.day, Math.floor(rule.startMinute / 60), rule.startMinute % 60));
  }
  return out;
}

/** Last instant of `endsOn` in the rule's zone — the end date Zoom is given. */
export function seriesEndsAt(rule: SeriesRule): Date {
  const p = indexToParts(ymdToIndex(rule.endsOn));
  return zonedTimeToUtc(rule.timezone, p.year, p.month, p.day, 23, 59);
}

/** Human-readable reason the rule is unusable, or null when it is fine. */
export function validateRule(rule: SeriesRule): string | null {
  if (!isYmd(rule.startsOn) || !isYmd(rule.endsOn)) return "Enter valid start and end dates";
  const unique = new Set(rule.daysOfWeek);
  if (unique.size === 0) return "Pick at least one weekday";
  if ([...unique].some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Weekdays must be 0–6";
  if (!Number.isInteger(rule.intervalWeeks) || rule.intervalWeeks < 1 || rule.intervalWeeks > MAX_INTERVAL_WEEKS) {
    return `Repeat every 1–${MAX_INTERVAL_WEEKS} weeks`;
  }
  if (!Number.isInteger(rule.startMinute) || rule.startMinute < 0 || rule.startMinute >= 1440) return "Enter a valid start time";
  const span = ymdToIndex(rule.endsOn) - ymdToIndex(rule.startsOn);
  if (span < 0) return "The end date is before the start date";
  if (span > MAX_SERIES_SPAN_DAYS) return "A series can run for at most a year";
  if (seriesOccurrences(rule).length === 0) return "No dates match that schedule";
  return null;
}

/** Zoom's weekly_days format: 1 = Sunday … 7 = Saturday, comma-separated. */
export function zoomWeeklyDays(daysOfWeek: number[]): string {
  return [...new Set(daysOfWeek)].sort((a, b) => a - b).map((d) => d + 1).join(",");
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function formatMinuteOfDay(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatYmd(ymd: string): string {
  const p = indexToParts(ymdToIndex(ymd));
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Every Tuesday and Thursday at 7:00 PM (New York), through Dec 3, 2026" */
export function describeRule(rule: SeriesRule): string {
  const days = [...new Set(rule.daysOfWeek)].sort((a, b) => a - b).map((d) => DAY_NAMES[d]);
  const dayText = days.length === 7 ? "day" : joinList(days);
  const every = rule.intervalWeeks === 1 ? `Every ${dayText}` : `Every ${rule.intervalWeeks} weeks on ${dayText}`;
  return `${every} at ${formatMinuteOfDay(rule.startMinute)} (${zoneCity(rule.timezone)}), through ${formatYmd(rule.endsOn)}`;
}
