import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { roleAtLeast } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "MODERATOR", "LEARNER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (actor) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return apiError(404, "User not found");
    if (target.id === actor.id) return apiError(400, "You can't modify your own account here");

    // Role changes and admin creation are SUPER_ADMIN-only.
    if (body.role !== undefined && actor.role !== "SUPER_ADMIN") {
      return apiError(403, "Only a Super Admin can change roles");
    }
    // Suspension requires ADMIN+, and admins can't suspend equal/higher roles.
    if (body.status !== undefined) {
      if (!roleAtLeast(actor.role, "ADMIN")) return apiError(403, "Admin permissions required");
      if (roleAtLeast(target.role, actor.role)) {
        return apiError(403, "You can't suspend a user at or above your role");
      }
    }

    const updated = await db.user.update({ where: { id }, data: body });
    if (body.role) {
      await audit({
        actorId: actor.id,
        action: "user.role_changed",
        entityType: "user",
        entityId: id,
        details: { from: target.role, to: body.role, name: target.name },
      });
    }
    if (body.status) {
      await audit({
        actorId: actor.id,
        action: body.status === "SUSPENDED" ? "user.suspended" : "user.reinstated",
        entityType: "user",
        entityId: id,
        details: { name: target.name },
      });
      if (body.status === "SUSPENDED") {
        await db.session.deleteMany({ where: { userId: id } });
      }
    }
    return json({ user: { id: updated.id, role: updated.role, status: updated.status } });
  });
}
