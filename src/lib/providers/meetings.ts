/**
 * Meeting-link provider abstraction for 1-on-1 bookings and live calls.
 *
 * The product owns availability, slots, schedules and attendance; the actual
 * video meeting comes from a provider. Zoom (Server-to-Server OAuth) is the
 * built-in integration — Google Meet, Teams etc. can be added by implementing
 * MeetingProvider.
 *
 * Required environment variables for the Zoom integration:
 *   ZOOM_ACCOUNT_ID     — from the Server-to-Server OAuth app
 *   ZOOM_CLIENT_ID
 *   ZOOM_CLIENT_SECRET
 *   ZOOM_USER_ID        — email (or user id) of the licensed Zoom user that
 *                         meetings are created under by default. A host can
 *                         override this in their availability settings.
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
}

let tokenCache: { token: string; expiresAt: number } | null = null;

const ZOOM_SETTINGS = {
  join_before_host: false,
  waiting_room: true,
  mute_upon_entry: true,
  approval_type: 2,
};

function zoomTime(d: Date) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

class ZoomProvider implements MeetingProvider {
  readonly name = "Zoom";
  private accountId = process.env.ZOOM_ACCOUNT_ID ?? "";
  private clientId = process.env.ZOOM_CLIENT_ID ?? "";
  private clientSecret = process.env.ZOOM_CLIENT_SECRET ?? "";
  readonly defaultUserId = process.env.ZOOM_USER_ID ?? "";

  get configured() {
    return Boolean(this.accountId && this.clientId && this.clientSecret);
  }

  private async getToken(): Promise<string> {
    if (!this.configured) throw new Error("Zoom is not configured");
    if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(this.accountId)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) throw new Error(`Zoom token request failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return tokenCache.token;
  }

  private async request(path: string, init: RequestInit & { okStatuses?: number[] } = {}) {
    const token = await this.getToken();
    const { okStatuses = [], ...rest } = init;
    const res = await fetch(`https://api.zoom.us/v2${path}`, {
      ...rest,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(rest.headers ?? {}) },
    });
    if (!res.ok && !okStatuses.includes(res.status)) {
      throw new Error(`Zoom ${rest.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res;
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

export function getMeetingProvider(): MeetingProvider {
  return new ZoomProvider();
}

export const MEETING_PROVIDER_SETUP_MESSAGE =
  "The video provider isn't connected yet. An administrator needs to add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET and ZOOM_USER_ID to create Zoom links automatically.";
