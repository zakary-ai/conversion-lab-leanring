import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  type: z.enum(["PDF", "DOCUMENT", "SCRIPT", "TEMPLATE", "CHEAT_SHEET", "LINK", "VIDEO", "FILE"]).optional(),
  categoryId: z.string().nullable().optional(),
  url: z.string().trim().url().max(1000).optional(),
  minStars: z.number().int().min(0).max(100).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const resource = await db.resource.update({ where: { id }, data: body });
    if (body.status) {
      await audit({ actorId: user.id, action: `resource.${body.status.toLowerCase()}`, entityType: "resource", entityId: id, details: { title: resource.title } });
    }
    return json({ resource });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const resource = await db.resource.findUnique({ where: { id } });
    if (!resource) return apiError(404, "Resource not found");
    await db.resource.delete({ where: { id } });
    await audit({ actorId: user.id, action: "resource.delete", entityType: "resource", entityId: id, details: { title: resource.title } });
    return json({ ok: true });
  });
}
