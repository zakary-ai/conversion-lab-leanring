import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { json } from "@/lib/api";
import { getEmailProvider } from "@/lib/providers/email";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => null));
  // Always respond identically so the endpoint can't be used to probe emails
  const ok = json({
    ok: true,
    message: "If an account exists for that email, a reset link has been sent.",
  });
  if (!body.success) return ok;

  const user = await db.user.findUnique({ where: { email: body.data.email } });
  if (!user?.email) return ok;

  const token = crypto.randomBytes(32).toString("hex");
  await db.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const resetUrl = `${origin}/reset-password?token=${token}`;
  await getEmailProvider().send({
    to: user.email,
    subject: "Reset your password",
    html: `<p>Hi ${user.name},</p><p>Reset your password using the link below (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
  return ok;
}
