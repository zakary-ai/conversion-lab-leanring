/**
 * Meeting-link provider abstraction for 1-on-1 bookings and live calls.
 *
 * The product owns availability, slots, schedules and attendance; the actual
 * video meeting comes from a provider. Zoom (Server-to-Server OAuth) is the
 * built-in integration — Google Meet, Teams etc. can be added by implementing
 * MeetingProvider.
 *
 * Credentials come from one of two places (see lib/zoom-connections.ts):
 *   - a staff member's own ZoomConnection, entered on their profile, used for
 *     everything they host; or
 *   - the academy-wide environment variables, used for hosts without one:
 *       ZOOM_ACCOUNT_ID     — from the Server-to-Server OAuth app
 *       ZOOM_CLIENT_ID
 *       ZOOM_CLIENT_SECRET
 *       ZOOM_USER_ID        — email (or user id) of the licensed Zoom user that
 *                             meetings are created under by default. A host can
 *                             override this in their availability settings.
 *
 * The app needs the scopes meeting:write:admin, meeting:update:admin and
 * meeting:delete:admin (granular: meeting:write:meeting:admin,
 * meeting:update:meeting:admin, meeting:delete:meeting:admin).
 *
 * Without credentials bookings and calls still work end to end; the UI shows
 * an honest "video link not connected" state instead of pretending a link
 * exists.
 */

export type MeetingDetails = {
  userId: string;
  topic: string;
  startsAt: Date;
  durationMin: number;
  timezone: string;
  agenda?: string;
};

/** Weekly recurrence: weeklyDays use 0 = Sunday like the rest of the app. */
export type MeetingRecurrence = {
  weeklyDays: number[];
  intervalWeeks: number;
  endsAt: Date;
};

export type CreatedMeeting = { meetingId: string; joinUrl: string; startUrl: string };
export type CreatedRecurringMeeting = CreatedMeeting & {
  occurrences: { occurrenceId: string; startsAt: Date }[];
};

export interface MeetingProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Provider user meetings are created under when the host has no override. */
  readonly defaultUserId: string;
  createMeeting(opts: MeetingDetails): Promise<CreatedMeeting>;
  /** One recurring meeting whose occurrences share a join link. */
  createRecurringMeeting(opts: MeetingDetails & { recurrence: MeetingRecurrence }): Promise<CreatedRecurringMeeting>;
  /** Update a meeting, or a single occurrence of a recurring one. */
  updateMeeting(
    meetingId: string,
    patch: { topic?: string; startsAt?: Date; durationMin?: number; agenda?: string | null },
    occurrenceId?: string
  ): Promise<void>;
  /** Delete a meeting, or a single occurrence of a recurring one. */
  deleteMeeting(meetingId: string, occurrenceId?: string): Promise<void>;
  /**
   * Check the credentials (and, when the app has user:read scope, that the
   * user exists). Throws a MeetingProviderError with a human-readable message.
   */
  verify(userId: string): Promise<void>;
}

export type ZoomCredentials = {
  accountId: string;
  clientId: string;
  clientSecret: string;
  /** Zoom user meetings are created under when nothing more specific is set. */
  defaultUserId: string;
};

/** A provider failure with a message safe to show to the person who owns the credentials. */
export class MeetingProviderError extends Error {}

/** One access token per set of credentials (keyed by account + client id). */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const ZOOM_SETTINGS = {
  join_before_host: false,
  waiting_room: true,
  mute_upon_entry: true,
  approval_type: 2,
};

function zoomTime(d: Date) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Pull the human-readable part out of a Zoom error body. */
function zoomReason(body: string): string {
  try {
    const parsed = JSON.parse(body) as { reason?: string; message?: string; error_description?: string };
    return parsed.reason ?? parsed.message ?? parsed.error_description ?? body;
  } catch {
    return body;
  }
}

class ZoomProvider implements MeetingProvider {
  readonly name = "Zoom";
  readonly defaultUserId: string;
  private readonly accountId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(creds: ZoomCredentials) {
    this.accountId = creds.accountId;
    this.clientId = creds.clientId;
    this.clientSecret = creds.clientSecret;
    this.defaultUserId = creds.defaultUserId;
  }

  get configured() {
    return Boolean(this.accountId && this.clientId && this.clientSecret);
  }

  private get cacheKey() {
    return `${this.accountId}:${this.clientId}`;
  }

  private async fetchToken(): Promise<{ token: string; expiresAt: number }> {
    if (!this.configured) throw new MeetingProviderError("Zoom is not configured");
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(this.accountId)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) {
      const reason = zoomReason(await res.text());
      throw new MeetingProviderError(
        res.status === 400 || res.status === 401
          ? `Zoom rejected the credentials: ${reason}. Check the account ID, client ID and client secret of your Server-to-Server OAuth app.`
          : `Zoom token request failed: ${res.status} ${reason}`
      );
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  }

  private async getToken(): Promise<string> {
    const cached = tokenCache.get(this.cacheKey);
    if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
    const fresh = await this.fetchToken();
    tokenCache.set(this.cacheKey, fresh);
    return fresh.token;
  }

  private async request(path: string, init: RequestInit & { okStatuses?: number[] } = {}) {
    const token = await this.getToken();
    const { okStatuses = [], ...rest } = init;
    const res = await fetch(`https://api.zoom.us/v2${path}`, {
      ...rest,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(rest.headers ?? {}) },
    });
    if (!res.ok && !okStatuses.includes(res.status)) {
      throw new MeetingProviderError(`Zoom ${rest.method ?? "GET"} ${path} failed: ${res.status} ${zoomReason(await res.text())}`);
    }
    return res;
  }

  async verify(userId: string) {
    // Always hit Zoom for the token so a freshly entered (possibly wrong)
    // secret isn't masked by a token cached from the previous one.
    const fresh = await this.fetchToken();
    tokenCache.set(this.cacheKey, fresh);
    if (!userId) return;
    const res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${fresh.token}` },
    });
    if (res.status === 404) {
      throw new MeetingProviderError(`Zoom has no user "${userId}" on this account. Enter the email of a licensed user on the same account as the app.`);
    }
    // 400/401/403 here almost always mean the app lacks user:read scope,
    // which meeting creation doesn't need — so only a definite "not found"
    // fails verification.
  }

  private meetingBody(opts: MeetingDetails) {
    return {
      topic: opts.topic.slice(0, 200),
      start_time: zoomTime(opts.startsAt),
      duration: opts.durationMin,
      timezone: opts.timezone,
      agenda: opts.agenda?.slice(0, 2000),
      settings: ZOOM_SETTINGS,
    };
  }

  async createMeeting(opts: MeetingDetails) {
    const res = await this.request(`/users/${encodeURIComponent(opts.userId)}/meetings`, {
      method: "POST",
      body: JSON.stringify({ ...this.meetingBody(opts), type: 2 }), // scheduled
    });
    const data = (await res.json()) as { id: number | string; join_url: string; start_url: string };
    return { meetingId: String(data.id), joinUrl: data.join_url, startUrl: data.start_url };
  }

  async createRecurringMeeting(opts: MeetingDetails & { recurrence: MeetingRecurrence }) {
    const res = await this.request(`/users/${encodeURIComponent(opts.userId)}/meetings`, {
      method: "POST",
      body: JSON.stringify({
        ...this.meetingBody(opts),
        type: 8, // recurring with fixed time
        recurrence: {
          type: 2, // weekly
          repeat_interval: opts.recurrence.intervalWeeks,
          // Zoom counts 1 = Sunday … 7 = Saturday
          weekly_days: [...new Set(opts.recurrence.weeklyDays)].sort((a, b) => a - b).map((d) => d + 1).join(","),
          end_date_time: zoomTime(opts.recurrence.endsAt),
        },
      }),
    });
    const data = (await res.json()) as {
      id: number | string;
      join_url: string;
      start_url: string;
      occurrences?: { occurrence_id: string; start_time: string }[];
    };
    return {
      meetingId: String(data.id),
      joinUrl: data.join_url,
      startUrl: data.start_url,
      occurrences: (data.occurrences ?? []).map((o) => ({ occurrenceId: o.occurrence_id, startsAt: new Date(o.start_time) })),
    };
  }

  async updateMeeting(
    meetingId: string,
    patch: { topic?: string; startsAt?: Date; durationMin?: number; agenda?: string | null },
    occurrenceId?: string
  ) {
    const qs = occurrenceId ? `?occurrence_id=${encodeURIComponent(occurrenceId)}` : "";
    await this.request(`/meetings/${encodeURIComponent(meetingId)}${qs}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(patch.topic !== undefined ? { topic: patch.topic.slice(0, 200) } : {}),
        ...(patch.startsAt ? { start_time: zoomTime(patch.startsAt) } : {}),
        ...(patch.durationMin !== undefined ? { duration: patch.durationMin } : {}),
        ...(patch.agenda !== undefined ? { agenda: (patch.agenda ?? "").slice(0, 2000) } : {}),
      }),
    });
  }

  async deleteMeeting(meetingId: string, occurrenceId?: string) {
    const qs = occurrenceId
      ? `?occurrence_id=${encodeURIComponent(occurrenceId)}&schedule_for_reminder=false`
      : "?schedule_for_reminder=false";
    // 404 = already gone, which is fine for a cancel
    await this.request(`/meetings/${encodeURIComponent(meetingId)}${qs}`, { method: "DELETE", okStatuses: [404] });
  }
}

/** The academy-wide provider from ZOOM_* environment variables (may be unconfigured). */
export function getMeetingProvider(): MeetingProvider {
  return new ZoomProvider({
    accountId: process.env.ZOOM_ACCOUNT_ID ?? "",
    clientId: process.env.ZOOM_CLIENT_ID ?? "",
    clientSecret: process.env.ZOOM_CLIENT_SECRET ?? "",
    defaultUserId: process.env.ZOOM_USER_ID ?? "",
  });
}

/** A provider for one person's own Zoom credentials. */
export function meetingProviderFor(creds: ZoomCredentials): MeetingProvider {
  return new ZoomProvider(creds);
}

export const MEETING_PROVIDER_SETUP_MESSAGE =
  "No Zoom account is connected for this host. Hosts can connect their own Zoom account from their profile, or an administrator can add academy-wide credentials (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_USER_ID).";
