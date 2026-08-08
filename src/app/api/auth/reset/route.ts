import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError(400, "Password must be at least 8 characters");

  const reset = await db.passwordResetToken.findUnique({ where: { token: body.data.token } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return apiError(400, "This reset link is invalid or has expired");
  }

  await db.$transaction([
    db.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await hashPassword(body.data.password) },
    }),
    db.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    // Invalidate existing sessions on password change
    db.session.deleteMany({ where: { userId: reset.userId } }),
  ]);
  return json({ ok: true });
}
