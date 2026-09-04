/**
 * Time zone helpers shared by the server and the browser. Zones are IANA
 * names ("America/New_York") everywhere: the account setting, host
 * availability, bookings and the Zoom API all speak that format.
 *
 * Nothing here touches the database — see ./user-timezone.ts for the
 * server-side writes that keep every record in step with the account zone.
 */

export const DEFAULT_TIMEZONE = "UTC";

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Zone reported by the runtime (the browser, or the Node process). Never throws. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** The account zone when set and valid, otherwise `fallback` (UTC by default). */
export function resolveTimeZone(account: string | null | undefined, fallback = DEFAULT_TIMEZONE): string {
  return account && isValidTimeZone(account) ? account : fallback;
}

// Used only when the runtime can't enumerate zones (very old browsers).
const FALLBACK_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Bogota",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** Every zone the runtime knows, sorted. Falls back to a curated list. */
export function listTimeZones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const zones = Intl.supportedValuesOf("timeZone");
      if (zones.length > 0) return [...zones].sort();
    }
  } catch {}
  return FALLBACK_ZONES;
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires" */
export function zoneCity(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

/** "America/New_York" → "America"; zones without a slash group under "Other". */
export function zoneRegion(tz: string): string {
  return tz.includes("/") ? tz.split("/")[0] : "Other";
}

/** "GMT-4" style offset of `tz` at `at`; empty string if the runtime can't say. */
export function zoneOffsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** Human label for chips and hints: "New York (GMT-4)". */
export function describeTimeZone(tz: string, at: Date = new Date()): string {
  const offset = zoneOffsetLabel(tz, at);
  return offset ? `${zoneCity(tz)} (${offset})` : zoneCity(tz);
}

/** Wall-clock preview for a zone: { time: "3:42 PM", weekday: "Thursday" }. */
export function wallClockIn(tz: string, at: Date = new Date()): { time: string; weekday: string } | null {
  try {
    return {
      time: new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at),
      weekday: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(at),
    };
  } catch {
    return null;
  }
}
