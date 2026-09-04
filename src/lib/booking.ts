/**
 * Pure slot/timezone engine for 1-on-1 bookings. No database access.
 *
 * Hosts describe availability as weekly recurring windows in their own IANA
 * timezone (minutes since local midnight). Learners see concrete UTC instants,
 * rendered in their browser's zone. There is no date library in this project,
 * so timezone math is done with Intl.DateTimeFormat.
 */

export type WeeklyWindow = { dayOfWeek: number; startMinute: number; endMinute: number };
export type Interval = { startsAt: Date; endsAt: Date };
export type Slot = Interval;

/** How far ahead learners can book. */
export const BOOKING_HORIZON_DAYS = 28;
export const SLOT_LENGTH_OPTIONS = [15, 20, 30, 45, 60, 90] as const;
export const MAX_UPCOMING_BOOKINGS_PER_LEARNER = 3;
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// Zone validation lives with the other zone helpers; re-exported so existing
// imports keep working.
export { isValidTimeZone } from "./timezone";

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar fields of `at` as seen on a wall clock in `timeZone`. */
export function localDateParts(timeZone: string, at: Date) {
  const parts = formatterFor(timeZone).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hour === 24 ? 0 : hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** UTC offset of `timeZone` at instant `at`, in minutes (e.g. -240 for EDT). */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const p = localDateParts(timeZone, at);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUtc - at.getTime()) / MINUTE);
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC instant. Two-pass so DST
 * transitions resolve correctly. Non-existent local times (spring forward)
 * shift forward; ambiguous local times (fall back) take the first occurrence.
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const o1 = zoneOffsetMinutes(timeZone, new Date(guess));
  let candidate = guess - o1 * MINUTE;
  const o2 = zoneOffsetMinutes(timeZone, new Date(candidate));
  if (o2 !== o1) candidate = guess - o2 * MINUTE;
  return new Date(candidate);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

export function slotKeyFor(hostId: string, startsAt: Date): string {
  return `${hostId}|${startsAt.toISOString()}`;
}

/** True when any two windows on the same day overlap. */
export function windowsOverlap(windows: WeeklyWindow[]): boolean {
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i];
      const b = windows[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      if (a.startMinute < b.endMinute && a.endMinute > b.startMinute) return true;
    }
  }
  return false;
}

/**
 * Expand weekly windows into bookable slots between `from` and `to` (UTC),
 * excluding anything that starts before `now + minNoticeMinutes` or overlaps
 * an existing interval.
 */
export function generateSlots(opts: {
  windows: WeeklyWindow[];
  timezone: string;
  slotMinutes: number;
  from: Date;
  to: Date;
  existing: Interval[];
  minNoticeMinutes: number;
  now?: Date;
}): Slot[] {
  const { windows, timezone, slotMinutes, from, to, existing, minNoticeMinutes } = opts;
  if (windows.length === 0 || slotMinutes <= 0 || to <= from) return [];
  const now = opts.now ?? new Date();
  const earliest = new Date(Math.max(from.getTime(), now.getTime() + minNoticeMinutes * MINUTE));

  const byDay = new Map<number, WeeklyWindow[]>();
  for (const w of windows) {
    const list = byDay.get(w.dayOfWeek) ?? [];
    list.push(w);
    byDay.set(w.dayOfWeek, list);
  }

  // Enumerate host-local calendar dates one day either side of the range so
  // late-evening or early-morning windows near the boundary aren't dropped.
  const first = localDateParts(timezone, new Date(from.getTime() - DAY));
  const last = localDateParts(timezone, new Date(to.getTime() + DAY));
  let cursor = Date.UTC(first.year, first.month - 1, first.day);
  const end = Date.UTC(last.year, last.month - 1, last.day);

  const seen = new Set<string>();
  const slots: Slot[] = [];
  while (cursor <= end) {
    const d = new Date(cursor);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const weekday = d.getUTCDay();
    for (const w of byDay.get(weekday) ?? []) {
      for (let t = w.startMinute; t + slotMinutes <= w.endMinute; t += slotMinutes) {
        const startsAt = zonedTimeToUtc(timezone, y, m, day, Math.floor(t / 60), t % 60);
        const endsAt = new Date(startsAt.getTime() + slotMinutes * MINUTE);
        if (startsAt < earliest || endsAt > to) continue;
        const slot = { startsAt, endsAt };
        if (existing.some((e) => overlaps(slot, e))) continue;
        const key = startsAt.toISOString();
        if (seen.has(key)) continue;
        seen.add(key);
        slots.push(slot);
      }
    }
    cursor += DAY;
  }
  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return slots;
}

/** "09:30" ↔ 570 helpers shared by the editor and validators. */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}
