import type { CallSeries, LiveCall } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { notifyMany } from "./notifications";
import { formatDate, formatTime } from "./format";
import { resolveTimeZone, zoneOffsetLabel } from "./timezone";
import { getMeetingProvider, MEETING_PROVIDER_SETUP_MESSAGE } from "./providers/meetings";
import { describeRule, seriesEndsAt, seriesOccurrences, validateRule, type SeriesRule } from "./call-series";

/**
 * Database-aware live call operations: one-off calls, recurring series and
 * the Zoom meetings behind them. Route handlers stay thin and call these.
 *
 * Zoom is best effort everywhere: a provider failure never loses a call or
 * a series — the result carries an honest `video` state the UI can show.
 */

export class CallRuleError extends Error {
  constructor(message: string, readonly status: 400 | 404 = 400) {
    super(message);
  }
}

export type VideoResult = { configured: boolean; hosted: boolean; message?: string };

export type CallInput = {
  title: string;
  description?: string | null;
  hostId?: string | null;
  durationMin: number;
  minStars: number;
  maxAttendees?: number | null;
  recordingEnabled: boolean;
  /** Create the Zoom meeting (ignored when Zoom isn't configured). */
  hostOnZoom: boolean;
};

/** Zoom user a call's meeting is created under: the host's own seat if they set one, else the academy default. */
async function zoomUserFor(hostId: string | null | undefined, defaultUserId: string): Promise<string> {
  if (hostId) {
    const availability = await db.hostAvailability.findUnique({ where: { hostId }, select: { zoomUserId: true } });
    const own = availability?.zoomUserId?.trim();
    if (own) return own;
  }
  return defaultUserId;
}

function noZoom(configured: boolean): VideoResult {
  return configured
    ? { configured: true, hosted: false }
    : { configured: false, hosted: false, message: MEETING_PROVIDER_SETUP_MESSAGE };
}

export async function createSingleCall(
  input: CallInput & { scheduledAt: Date; timezone: string },
  actorId: string
): Promise<{ call: LiveCall; video: VideoResult }> {
  const { hostOnZoom, timezone, ...data } = input;
  let call = await db.liveCall.create({ data });
  await audit({ actorId, action: "call.create", entityType: "call", entityId: call.id, details: { title: call.title } });

  const provider = getMeetingProvider();
  let video: VideoResult = noZoom(provider.configured);
  if (hostOnZoom && provider.configured) {
    const zoomUser = await zoomUserFor(call.hostId, provider.defaultUserId);
    if (!zoomUser) {
      video = { configured: true, hosted: false, message: "No Zoom user is set (ZOOM_USER_ID). The call was scheduled without a Zoom link." };
    } else {
      try {
        const meeting = await provider.createMeeting({
          userId: zoomUser,
          topic: call.title,
          startsAt: call.scheduledAt,
          durationMin: call.durationMin,
          timezone,
          agenda: call.description ?? undefined,
        });
        call = await db.liveCall.update({
          where: { id: call.id },
          data: { meetingProvider: provider.name.toLowerCase(), meetingId: meeting.meetingId, joinUrl: meeting.joinUrl, startUrl: meeting.startUrl },
        });
        video = { configured: true, hosted: true };
      } catch (err) {
        console.error("[calls] Zoom meeting creation failed", err);
        video = { configured: true, hosted: false, message: `The ${provider.name} meeting couldn't be created. The call is scheduled; add a link by editing it or try again.` };
      }
    }
  }
  return { call, video };
}

export async function createCallSeries(
  input: CallInput & { rule: SeriesRule },
  actorId: string
): Promise<{ series: CallSeries; calls: LiveCall[]; video: VideoResult }> {
  const { hostOnZoom, rule, ...data } = input;
  const problem = validateRule(rule);
  if (problem) throw new CallRuleError(problem);
  const occurrences = seriesOccurrences(rule);

  const series = await db.callSeries.create({
    data: {
      ...data,
      timezone: rule.timezone,
      daysOfWeek: [...new Set(rule.daysOfWeek)].sort((a, b) => a - b),
      intervalWeeks: rule.intervalWeeks,
      startMinute: rule.startMinute,
      startsOn: rule.startsOn,
      endsOn: rule.endsOn,
      calls: {
        create: occurrences.map((at) => ({
          title: data.title,
          description: data.description,
          hostId: data.hostId,
          scheduledAt: at,
          seriesSlot: at,
          durationMin: data.durationMin,
          minStars: data.minStars,
          maxAttendees: data.maxAttendees,
          recordingEnabled: data.recordingEnabled,
        })),
      },
    },
  });
  let calls = await db.liveCall.findMany({ where: { seriesId: series.id }, orderBy: { scheduledAt: "asc" } });
  await audit({
    actorId,
    action: "call_series.create",
    entityType: "call_series",
    entityId: series.id,
    details: { title: series.title, rule: describeRule(rule), occurrences: calls.length },
  });

  const provider = getMeetingProvider();
  let video: VideoResult = noZoom(provider.configured);
  let updatedSeries = series;
  if (hostOnZoom && provider.configured) {
    const zoomUser = await zoomUserFor(series.hostId, provider.defaultUserId);
    if (!zoomUser) {
      video = { configured: true, hosted: false, message: "No Zoom user is set (ZOOM_USER_ID). The series was scheduled without a Zoom link." };
    } else {
      try {
        const meeting = await provider.createRecurringMeeting({
          userId: zoomUser,
          topic: series.title,
          startsAt: occurrences[0],
          durationMin: series.durationMin,
          timezone: rule.timezone,
          agenda: series.description ?? undefined,
          recurrence: { weeklyDays: rule.daysOfWeek, intervalWeeks: rule.intervalWeeks, endsAt: seriesEndsAt(rule) },
        });
        const providerName = provider.name.toLowerCase();
        const occurrenceIds = new Map(meeting.occurrences.map((o) => [o.startsAt.getTime(), o.occurrenceId]));
        await db.$transaction([
          db.callSeries.update({
            where: { id: series.id },
            data: { meetingProvider: providerName, meetingId: meeting.meetingId, joinUrl: meeting.joinUrl, startUrl: meeting.startUrl },
          }),
          ...calls.map((c) =>
            db.liveCall.update({
              where: { id: c.id },
              data: {
                meetingProvider: providerName,
                meetingId: meeting.meetingId,
                meetingOccurrenceId: occurrenceIds.get(c.scheduledAt.getTime()) ?? null,
                joinUrl: meeting.joinUrl,
                startUrl: meeting.startUrl,
              },
            })
          ),
        ]);
        updatedSeries = (await db.callSeries.findUnique({ where: { id: series.id } })) ?? series;
        calls = await db.liveCall.findMany({ where: { seriesId: series.id }, orderBy: { scheduledAt: "asc" } });
        video = { configured: true, hosted: true };
      } catch (err) {
        console.error("[calls] Zoom recurring meeting creation failed", err);
        video = { configured: true, hosted: false, message: `The ${provider.name} meeting couldn't be created. The series is scheduled without a Zoom link.` };
      }
    }
  }
  return { series: updatedSeries, calls, video };
}

/** Tell eligible learners about a new call or series, each on their own clock. */
export async function announceCall(opts: { title: string; minStars: number; firstAt: Date; linkUrl: string; series?: SeriesRule }) {
  const eligible = await db.user.findMany({
    where: { status: "ACTIVE", starBalance: { gte: opts.minStars }, role: "LEARNER" },
    select: { id: true, timezone: true },
  });
  const byZone = new Map<string, string[]>();
  for (const u of eligible) {
    const zone = resolveTimeZone(u.timezone);
    byZone.set(zone, [...(byZone.get(zone) ?? []), u.id]);
  }
  await Promise.all(
    Array.from(byZone, ([zone, userIds]) =>
      notifyMany(userIds, {
        type: "CALL_UPCOMING",
        title: opts.series ? `New recurring call: ${opts.title}` : `New live call: ${opts.title}`,
        body: opts.series
          ? `${describeRule(opts.series)}. First session ${formatDate(opts.firstAt, zone)} · ${formatTime(opts.firstAt, zone)} (${zoneOffsetLabel(zone, opts.firstAt) || zone})`
          : `${formatDate(opts.firstAt, zone)} · ${formatTime(opts.firstAt, zone)} (${zoneOffsetLabel(zone, opts.firstAt) || zone})`,
        linkUrl: opts.linkUrl,
      })
    )
  );
}

/** Remove the Zoom meeting (or just this occurrence of a series meeting). Never throws. */
async function removeMeetingFor(call: Pick<LiveCall, "id" | "seriesId" | "meetingId" | "meetingOccurrenceId">) {
  if (!call.meetingId) return;
  // A series occurrence without its Zoom occurrence id can't be removed on
  // its own — deleting the meeting would take the whole series with it.
  if (call.seriesId && !call.meetingOccurrenceId) return;
  const provider = getMeetingProvider();
  if (!provider.configured) return;
  try {
    await provider.deleteMeeting(call.meetingId, call.seriesId ? call.meetingOccurrenceId! : undefined);
  } catch (err) {
    console.error(`[calls] Zoom cleanup failed for call ${call.id}`, err);
  }
}

export async function cancelCall(callId: string, actorId: string): Promise<LiveCall> {
  const call = await db.liveCall.findUnique({ where: { id: callId } });
  if (!call) throw new CallRuleError("Call not found", 404);
  const updated = await db.liveCall.update({
    where: { id: callId },
    data: { status: "CANCELLED", joinUrl: null, startUrl: null },
  });
  await removeMeetingFor(call);
  await audit({ actorId, action: "call.cancel", entityType: "call", entityId: callId, details: { title: call.title } });
  return updated;
}

export async function deleteCall(callId: string, actorId: string): Promise<void> {
  const call = await db.liveCall.findUnique({ where: { id: callId } });
  if (!call) throw new CallRuleError("Call not found", 404);
  await removeMeetingFor(call);
  await db.liveCall.delete({ where: { id: callId } });
  await audit({ actorId, action: "call.delete", entityType: "call", entityId: callId, details: { title: call.title } });
}

/** Keep the Zoom meeting in step after a call's title, time, length or description changed. Never throws. */
export async function syncCallMeeting(call: LiveCall) {
  if (!call.meetingId) return;
  if (call.seriesId && !call.meetingOccurrenceId) return;
  const provider = getMeetingProvider();
  if (!provider.configured) return;
  try {
    await provider.updateMeeting(
      call.meetingId,
      {
        // Series occurrences keep the series topic; only their time and length can move.
        ...(call.seriesId ? {} : { topic: call.title, agenda: call.description }),
        startsAt: call.scheduledAt,
        durationMin: call.durationMin,
      },
      call.seriesId ? call.meetingOccurrenceId! : undefined
    );
  } catch (err) {
    console.error(`[calls] Zoom update failed for call ${call.id}`, err);
  }
}

/**
 * Cancel a series: future scheduled occurrences are cancelled, past and
 * ended ones (and their recordings) are kept, and the Zoom meeting is removed.
 */
export async function cancelSeries(seriesId: string, actorId: string): Promise<{ series: CallSeries; cancelled: number }> {
  const series = await db.callSeries.findUnique({ where: { id: seriesId } });
  if (!series) throw new CallRuleError("Series not found", 404);
  const now = new Date();
  const [, updated] = await db.$transaction([
    db.liveCall.updateMany({
      where: { seriesId, status: "SCHEDULED", scheduledAt: { gte: now } },
      data: { status: "CANCELLED", joinUrl: null, startUrl: null },
    }),
    db.callSeries.update({ where: { id: seriesId }, data: { status: "CANCELLED", joinUrl: null, startUrl: null } }),
  ]);
  if (series.meetingId) {
    const provider = getMeetingProvider();
    if (provider.configured) {
      try {
        await provider.deleteMeeting(series.meetingId);
      } catch (err) {
        console.error(`[calls] Zoom cleanup failed for series ${seriesId}`, err);
      }
    }
  }
  const cancelled = await db.liveCall.count({ where: { seriesId, status: "CANCELLED", scheduledAt: { gte: now } } });
  await audit({ actorId, action: "call_series.cancel", entityType: "call_series", entityId: seriesId, details: { title: series.title, cancelled } });
  return { series: updated, cancelled };
}

/** Apply shared edits to a series and every future scheduled occurrence. */
export async function updateSeries(
  seriesId: string,
  patch: { title?: string; description?: string | null; hostId?: string | null; minStars?: number; maxAttendees?: number | null; recordingEnabled?: boolean },
  actorId: string
): Promise<CallSeries> {
  const series = await db.callSeries.findUnique({ where: { id: seriesId } });
  if (!series) throw new CallRuleError("Series not found", 404);
  const now = new Date();
  const [updated] = await db.$transaction([
    db.callSeries.update({ where: { id: seriesId }, data: patch }),
    db.liveCall.updateMany({ where: { seriesId, status: "SCHEDULED", scheduledAt: { gte: now } }, data: patch }),
  ]);
  if (series.meetingId && (patch.title !== undefined || patch.description !== undefined)) {
    const provider = getMeetingProvider();
    if (provider.configured) {
      try {
        await provider.updateMeeting(series.meetingId, { topic: patch.title, agenda: patch.description });
      } catch (err) {
        console.error(`[calls] Zoom update failed for series ${seriesId}`, err);
      }
    }
  }
  await audit({ actorId, action: "call_series.update", entityType: "call_series", entityId: seriesId, details: { ...patch } });
  return updated;
}
