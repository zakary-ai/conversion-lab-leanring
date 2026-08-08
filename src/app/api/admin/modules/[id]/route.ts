import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  minStars: z.number().int().min(0).max(100).optional(),
  starReward: z.number().int().min(0).max(10).optional(),
  prerequisiteId: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    if (body.prerequisiteId === id) return apiError(400, "A module can't require itself");
    const moduleRow = await db.module.update({ where: { id }, data: body });
    if (body.status) {
      await audit({
        actorId: user.id,
        action: `module.${body.status.toLowerCase()}`,
        entityType: "module",
        entityId: id,
        details: { title: moduleRow.title },
      });
    }
    return json({ module: moduleRow });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const moduleRow = await db.module.findUnique({ where: { id } });
    if (!moduleRow) return apiError(404, "Module not found");
    await db.module.delete({ where: { id } });
    await audit({ actorId: user.id, action: "module.delete", entityType: "module", entityId: id, details: { title: moduleRow.title } });
    return json({ ok: true });
  });
}
