import type { ZoomConnection } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { decryptSecret, encryptSecret } from "./secrets";
import { getMeetingProvider, meetingProviderFor, MeetingProviderError, type MeetingProvider } from "./providers/meetings";

/**
 * Per-person Zoom credentials. A staff member can connect their own Zoom
 * account (a Server-to-Server OAuth app) on their profile; every call and
 * 1-on-1 they host is then created on their account. Hosts without one fall
 * back to the academy-wide ZOOM_* environment credentials.
 *
 * The client secret is encrypted at rest and never leaves the server: the
 * API only ever returns the summary shape below.
 */

export type ZoomConnectionSummary = {
  accountId: string;
  clientId: string;
  zoomUserId: string;
  verifiedAt: string | null;
  updatedAt: string;
};

export type ZoomConnectionInput = {
  accountId: string;
  clientId: string;
  /** Empty when re-saving with the stored secret unchanged. */
  clientSecret: string;
  zoomUserId: string;
};

/** Where a host's meetings get created, and the credentials to use. */
export type ResolvedMeetingProvider = {
  provider: MeetingProvider;
  /** Zoom user the meeting is created under ("" when nothing is set). */
  userId: string;
  /** Connection id to remember on the meeting; null = academy-wide credentials. */
  connectionId: string | null;
  source: "own" | "academy";
};

export function summarize(conn: ZoomConnection): ZoomConnectionSummary {
  return {
    accountId: conn.accountId,
    clientId: conn.clientId,
    zoomUserId: conn.zoomUserId,
    verifiedAt: conn.verifiedAt?.toISOString() ?? null,
    updatedAt: conn.updatedAt.toISOString(),
  };
}

function providerFromConnection(conn: ZoomConnection): MeetingProvider {
  return meetingProviderFor({
    accountId: conn.accountId,
    clientId: conn.clientId,
    clientSecret: decryptSecret(conn.clientSecretEnc),
    defaultUserId: conn.zoomUserId,
  });
}

export async function getZoomConnection(userId: string): Promise<ZoomConnectionSummary | null> {
  const conn = await db.zoomConnection.findUnique({ where: { userId } });
  return conn ? summarize(conn) : null;
}

/** Ids of staff who have connected their own Zoom account. */
export async function connectedZoomUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.zoomConnection.findMany({ where: { userId: { in: userIds } }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

/** True when at least one host can get Zoom links: env credentials or any personal connection. */
export async function anyZoomAvailable(): Promise<boolean> {
  if (getMeetingProvider().configured) return true;
  return (await db.zoomConnection.count()) > 0;
}

/**
 * Credentials for meetings a host runs: their own connection first, then the
 * academy-wide provider (with the host's optional user override from their
 * availability settings). Null when neither is configured.
 */
export async function resolveMeetingProviderForHost(hostId: string | null | undefined): Promise<ResolvedMeetingProvider | null> {
  if (hostId) {
    const conn = await db.zoomConnection.findUnique({ where: { userId: hostId } });
    if (conn) return { provider: providerFromConnection(conn), userId: conn.zoomUserId, connectionId: conn.id, source: "own" };
  }
  const academy = getMeetingProvider();
  if (!academy.configured) return null;
  let userId = academy.defaultUserId;
  if (hostId) {
    const availability = await db.hostAvailability.findUnique({ where: { hostId }, select: { zoomUserId: true } });
    userId = availability?.zoomUserId?.trim() || userId;
  }
  return { provider: academy, userId, connectionId: null, source: "academy" };
}

/**
 * The provider an existing meeting was created with, for updates and
 * deletions. Falls back to the academy provider when the connection is gone
 * (the host disconnected); null when nothing can reach Zoom.
 */
export async function providerForMeeting(connectionId: string | null | undefined): Promise<MeetingProvider | null> {
  if (connectionId) {
    const conn = await db.zoomConnection.findUnique({ where: { id: connectionId } });
    if (conn) return providerFromConnection(conn);
  }
  const academy = getMeetingProvider();
  return academy.configured ? academy : null;
}

/** Verify the credentials against Zoom, then store them. Throws MeetingProviderError with a readable message. */
export async function saveZoomConnection(userId: string, input: ZoomConnectionInput): Promise<ZoomConnectionSummary> {
  const existing = await db.zoomConnection.findUnique({ where: { userId } });
  const clientSecret = input.clientSecret || (existing ? decryptSecret(existing.clientSecretEnc) : "");
  if (!clientSecret) throw new MeetingProviderError("Enter the client secret from your Zoom app.");

  const provider = meetingProviderFor({
    accountId: input.accountId,
    clientId: input.clientId,
    clientSecret,
    defaultUserId: input.zoomUserId,
  });
  await provider.verify(input.zoomUserId);

  const data = {
    accountId: input.accountId,
    clientId: input.clientId,
    clientSecretEnc: encryptSecret(clientSecret),
    zoomUserId: input.zoomUserId,
    verifiedAt: new Date(),
  };
  const conn = await db.zoomConnection.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  await audit({
    actorId: userId,
    action: existing ? "zoom.update" : "zoom.connect",
    entityType: "zoom_connection",
    entityId: conn.id,
    details: { accountId: conn.accountId, clientId: conn.clientId, zoomUserId: conn.zoomUserId },
  });
  return summarize(conn);
}

/** Remove a person's Zoom credentials. Meetings already created keep their links. */
export async function deleteZoomConnection(userId: string): Promise<boolean> {
  const existing = await db.zoomConnection.findUnique({ where: { userId } });
  if (!existing) return false;
  await db.zoomConnection.delete({ where: { id: existing.id } });
  await audit({ actorId: userId, action: "zoom.disconnect", entityType: "zoom_connection", entityId: existing.id, details: {} });
  return true;
}
