import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { roleAtLeast } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generateAccessCode, formatAccessCode } from "@/lib/access-code";

async function guardTarget(actorRole: Role, id: string) {
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return { error: apiError(404, "User not found") };
  // Same boundary as suspension: only manage credentials of lower roles
  if (roleAtLeast(target.role, actorRole)) {
    return { error: apiError(403, "You can't manage the access code of a user at or above your role") };
  }
  return { target };
}

/** Generate (or regenerate) a user's access code. The old code stops working. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (actor) => {
    const { id } = await ctx.params;
    const { target, error } = await guardTarget(actor.role, id);
    if (error) return error;

    const accessCode = generateAccessCode();
    await db.user.update({ where: { id }, data: { accessCode } });
    await audit({
      actorId: actor.id,
      action: target!.accessCode ? "user.access_code_regenerated" : "user.access_code_created",
      entityType: "user",
      entityId: id,
      details: { name: target!.name },
    });
    return json({ accessCode: formatAccessCode(accessCode) });
  });
}

/** Remove a user's access code so it can no longer be used to sign in. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (actor) => {
    const { id } = await ctx.params;
    const { target, error } = await guardTarget(actor.role, id);
    if (error) return error;

    await db.user.update({ where: { id }, data: { accessCode: null } });
    await audit({
      actorId: actor.id,
      action: "user.access_code_removed",
      entityType: "user",
      entityId: id,
      details: { name: target!.name },
    });
    return json({ ok: true });
  });
}
