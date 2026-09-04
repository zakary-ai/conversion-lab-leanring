import { z } from "zod";
import { withRole, json, apiError } from "@/lib/api";
import { isValidTimeZone, resolveTimeZone } from "@/lib/timezone";
import { zonedTimeToUtc } from "@/lib/booking";
import { isYmd, MAX_INTERVAL_WEEKS } from "@/lib/call-series";
import { CallRuleError, announceCall, createCallSeries, createSingleCall } from "@/lib/call-service";

const ymd = z.string().refine(isYmd, "Use YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  hostId: z.string().nullable().optional(),
  durationMin: z.number().int().min(5).max(600).optional(),
  minStars: z.number().int().min(0).max(100).optional(),
  maxAttendees: z.number().int().min(1).max(10000).nullable().optional(),
  recordingEnabled: z.boolean().optional(),
  // Create the Zoom meeting (default on; ignored when Zoom isn't configured)
  hostOnZoom: z.boolean().optional(),
  // When: an absolute instant, or a wall-clock date/time in a zone — the admin
  // form sends the latter so "7 PM" means 7 PM in the admin's account zone.
  scheduledAt: z.string().datetime().optional(),
  date: ymd.optional(),
  time: hhmm.optional(),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone").optional(),
  // Present = a recurring series starting on `date` at `time`
  repeat: z
    .object({
      daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      intervalWeeks: z.number().int().min(1).max(MAX_INTERVAL_WEEKS).default(1),
      endsOn: ymd,
    })
    .optional(),
});

function minutesOf(hhmmValue: string) {
  const [h, m] = hhmmValue.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Schedule a live call — one-off, or a weekly series that creates every
 * occurrence now. Hosted on Zoom when configured, otherwise in embedded rooms.
 */
export async function POST(req: Request) {
  return withRole("ADMIN", async (user) => {
    const body = schema.parse(await req.json());
    const timezone = body.timezone ?? resolveTimeZone(user.timezone);
    const common = {
      title: body.title,
      description: body.description || null,
      hostId: body.hostId ?? null,
      durationMin: body.durationMin ?? 60,
      minStars: body.minStars ?? 0,
      maxAttendees: body.maxAttendees ?? null,
      recordingEnabled: body.recordingEnabled ?? false,
      hostOnZoom: body.hostOnZoom ?? true,
    };

    try {
      if (body.repeat) {
        if (!body.date || !body.time) return apiError(400, "A repeating call needs a start date and time");
        const rule = {
          timezone,
          daysOfWeek: body.repeat.daysOfWeek,
          intervalWeeks: body.repeat.intervalWeeks,
          startMinute: minutesOf(body.time),
          startsOn: body.date,
          endsOn: body.repeat.endsOn,
        };
        const { series, calls, video } = await createCallSeries({ ...common, rule }, user.id);
        const first = calls[0];
        if (first) {
          await announceCall({ title: series.title, minStars: series.minStars, firstAt: first.scheduledAt, linkUrl: `/calls/${first.id}`, series: rule });
        }
        return json({ series, calls, video });
      }

      let scheduledAt: Date;
      if (body.scheduledAt) {
        scheduledAt = new Date(body.scheduledAt);
      } else if (body.date && body.time) {
        const [y, mo, d] = body.date.split("-").map(Number);
        const minute = minutesOf(body.time);
        scheduledAt = zonedTimeToUtc(timezone, y, mo, d, Math.floor(minute / 60), minute % 60);
      } else {
        return apiError(400, "Provide scheduledAt, or a date and time");
      }
      const { call, video } = await createSingleCall({ ...common, scheduledAt, timezone }, user.id);
      await announceCall({ title: call.title, minStars: call.minStars, firstAt: call.scheduledAt, linkUrl: `/calls/${call.id}` });
      return json({ call, video });
    } catch (err) {
      if (err instanceof CallRuleError) return apiError(err.status, err.message);
      throw err;
    }
  });
}
