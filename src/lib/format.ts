/**
 * Display formatters. Every date helper takes an optional IANA `timeZone`:
 * server components pass `user.timezone`, client components pass the value
 * from `useTimeZone()`. When it is absent the runtime default applies (the
 * browser's zone on the client, the process zone on the server).
 */

type TimeZone = string | null | undefined;

function toDate(date: Date | string) {
  return typeof date === "string" ? new Date(date) : date;
}

function withZone<T extends Intl.DateTimeFormatOptions>(options: T, timeZone: TimeZone): T {
  return timeZone ? { ...options, timeZone } : options;
}

export function timeAgo(date: Date | string, timeZone?: TimeZone): string {
  const d = toDate(date);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, withZone({ month: "short", day: "numeric" }, timeZone));
}

export function formatDate(date: Date | string, timeZone?: TimeZone) {
  return toDate(date).toLocaleDateString(
    undefined,
    withZone({ weekday: "long", month: "long", day: "numeric" }, timeZone)
  );
}

export function formatDateShort(date: Date | string, timeZone?: TimeZone) {
  return toDate(date).toLocaleDateString(
    undefined,
    withZone({ month: "short", day: "numeric", year: "numeric" }, timeZone)
  );
}

export function formatTime(date: Date | string, timeZone?: TimeZone) {
  return toDate(date).toLocaleTimeString(undefined, withZone({ hour: "numeric", minute: "2-digit" }, timeZone));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export const ENUM_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MODERATOR: "Moderator",
  LEARNER: "Learner",
  EMPLOYER: "Employer",
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
  DOCUMENT: "Document",
  LINK: "Link",
  VIDEO: "Video",
  MULTIPLE_CHOICE: "Multiple choice",
  MULTIPLE_SELECT: "Multiple select",
  TRUE_FALSE: "True / False",
};

export function enumLabel(value: string) {
  return ENUM_LABELS[value] ?? value;
}
