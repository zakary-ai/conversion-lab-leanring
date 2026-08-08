import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  minStars: z.number().int().min(0).max(100).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const course = await db.course.update({ where: { id }, data: body });
    if (body.status) {
      await audit({
        actorId: user.id,
        action: `course.${body.status.toLowerCase()}`,
        entityType: "course",
        entityId: id,
        details: { title: course.title },
      });
    }
    return json({ course });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const course = await db.course.findUnique({ where: { id } });
    if (!course) return apiError(404, "Course not found");
    await db.course.delete({ where: { id } });
    await audit({ actorId: user.id, action: "course.delete", entityType: "course", entityId: id, details: { title: course.title } });
    return json({ ok: true });
  });
}
