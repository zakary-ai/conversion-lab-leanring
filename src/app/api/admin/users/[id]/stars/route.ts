import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { adjustStarsManually } from "@/lib/stars";
import { getSetting } from "@/lib/settings";

const schema = z.object({
  amount: z.number().int().min(-50).max(50).refine((n) => n !== 0, "Amount cannot be zero"),
  reason: z.string().trim().min(3, "A reason is required").max(500),
});

/** Manual star adjustment — always goes through the ledger with a reason. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (actor) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());

    const target = await db.user.findUnique({ where: { id } });
    if (!target) return apiError(404, "User not found");

    if (body.amount < 0) {
      const allowDeduct = await getSetting("progression.allowStarDeduction");
      if (!allowDeduct) return apiError(403, "Star deduction is disabled in platform settings");
    }

    const result = await adjustStarsManually({
      userId: id,
      amount: body.amount,
      reason: body.reason,
      actorId: actor.id,
    });
    return json({ ok: true, ...result });
  });
}
