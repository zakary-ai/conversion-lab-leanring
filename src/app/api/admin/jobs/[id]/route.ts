import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { jobSchema } from "@/lib/schemas/job";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const body = jobSchema.partial().parse(await req.json());
    const job = await db.job.update({ where: { id }, data: body });
    if (body.status) {
      await audit({ actorId: user.id, action: `job.${body.status.toLowerCase()}`, entityType: "job", entityId: id, details: { title: job.title } });
    }
    return json({ job });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const job = await db.job.findUnique({ where: { id } });
    if (!job) return apiError(404, "Job not found");
    await db.job.delete({ where: { id } });
    await audit({ actorId: user.id, action: "job.delete", entityType: "job", entityId: id, details: { title: job.title } });
    return json({ ok: true });
  });
}
