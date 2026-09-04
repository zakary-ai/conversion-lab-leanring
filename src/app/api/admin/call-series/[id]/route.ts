import { z } from "zod";
import { withRole, json, apiError } from "@/lib/api";
import { CallRuleError, cancelSeries, updateSeries } from "@/lib/call-service";

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  hostId: z.string().nullable().optional(),
  minStars: z.number().int().min(0).max(100).optional(),
  maxAttendees: z.number().int().min(1).max(10000).nullable().optional(),
  recordingEnabled: z.boolean().optional(),
});

/** Edit what a series is about; applies to the series and every upcoming occurrence. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    try {
      const series = await updateSeries(id, body, user.id);
      return json({ series });
    } catch (err) {
      if (err instanceof CallRuleError) return apiError(err.status, err.message);
      throw err;
    }
  });
}

/** Cancel a series: future occurrences are cancelled, past ones and recordings stay. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    try {
      const result = await cancelSeries(id, user.id);
      return json({ ok: true, cancelled: result.cancelled, series: result.series });
    } catch (err) {
      if (err instanceof CallRuleError) return apiError(err.status, err.message);
      throw err;
    }
  });
}
