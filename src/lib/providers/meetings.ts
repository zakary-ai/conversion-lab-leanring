/**
 * Meeting-link provider abstraction for 1-on-1 bookings.
 *
 * The product owns availability, slots and the booking record; the actual
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
 * The app needs the scopes meeting:write:admin and meeting:delete:admin
 * (granular: meeting:write:meeting:admin, meeting:delete:meeting:admin).
 *
 * Without credentials bookings still work end to end; the session shows an
 * honest "video link not connected" state instead of pretending a link exists.
 */

export interface MeetingProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Provider user meetings are created under when the host has no override. */
  readonly defaultUserId: string;
  createMeeting(opts: {
    userId: string;
    topic: string;
    startsAt: Date;
    durationMin: number;
    timezone: string;
    agenda?: string;
  }): Promise<{ meetingId: string; joinUrl: string; startUrl: string }>;
  deleteMeeting(meetingId: string): Promise<void>;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

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

  async createMeeting(opts: {
    userId: string;
    topic: string;
    startsAt: Date;
    durationMin: number;
    timezone: string;
    agenda?: string;
  }) {
    const token = await this.getToken();
    const res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(opts.userId)}/meetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: opts.topic.slice(0, 200),
        type: 2, // scheduled
        start_time: opts.startsAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
        duration: opts.durationMin,
        timezone: opts.timezone,
        agenda: opts.agenda?.slice(0, 2000),
        settings: {
          join_before_host: false,
          waiting_room: true,
          mute_upon_entry: true,
          approval_type: 2,
        },
      }),
    });
    if (!res.ok) throw new Error(`Zoom meeting creation failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { id: number | string; join_url: string; start_url: string };
    return { meetingId: String(data.id), joinUrl: data.join_url, startUrl: data.start_url };
  }

  async deleteMeeting(meetingId: string) {
    const token = await this.getToken();
    const res = await fetch(
      `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}?schedule_for_reminder=false`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    // 404 = already gone, which is fine for a cancel
    if (!res.ok && res.status !== 404) {
      throw new Error(`Zoom meeting deletion failed: ${res.status} ${await res.text()}`);
    }
  }
}

export function getMeetingProvider(): MeetingProvider {
  return new ZoomProvider();
}

export const MEETING_PROVIDER_SETUP_MESSAGE =
  "The video provider isn't connected yet. An administrator needs to add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET and ZOOM_USER_ID to create Zoom links automatically.";
