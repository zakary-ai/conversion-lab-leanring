/**
 * Real-time video (live calls) provider abstraction.
 *
 * The product schedules calls and manages attendance itself; the actual
 * meeting room comes from an embeddable WebRTC provider. Daily.co is the
 * built-in integration (prebuilt embeddable rooms) — LiveKit, 100ms etc. can
 * be added by implementing RtcProvider.
 *
 * Required environment variables for the Daily integration:
 *   DAILY_API_KEY  — Daily.co REST API key
 *   DAILY_DOMAIN   — your Daily subdomain, e.g. "conversionlab" (for
 *                    https://conversionlab.daily.co/<room>)
 *
 * Without credentials the app still fully manages scheduling, RSVPs and
 * recordings; the join screen shows a clear "provider not connected" state
 * instead of pretending a room exists.
 */

export interface RtcProvider {
  readonly name: string;
  readonly configured: boolean;
  createRoom(opts: { callId: string; enableRecording: boolean }): Promise<{ roomId: string; joinUrl: string }>;
  getJoinUrl(roomId: string): string;
}

class DailyProvider implements RtcProvider {
  readonly name = "Daily.co";
  private apiKey = process.env.DAILY_API_KEY ?? "";
  private domain = process.env.DAILY_DOMAIN ?? "";

  get configured() {
    return Boolean(this.apiKey && this.domain);
  }

  async createRoom(opts: { callId: string; enableRecording: boolean }) {
    if (!this.configured) throw new Error("Daily.co is not configured");
    const res = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `call-${opts.callId}`,
        privacy: "public",
        properties: {
          enable_chat: true,
          enable_screenshare: true,
          ...(opts.enableRecording ? { enable_recording: "cloud" } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`Daily.co room creation failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { name: string };
    return { roomId: data.name, joinUrl: this.getJoinUrl(data.name) };
  }

  getJoinUrl(roomId: string) {
    return `https://${this.domain}.daily.co/${roomId}`;
  }
}

export function getRtcProvider(): RtcProvider {
  return new DailyProvider();
}
