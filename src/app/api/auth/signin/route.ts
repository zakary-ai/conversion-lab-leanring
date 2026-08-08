import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError(400, "Invalid credentials");

  const user = await db.user.findUnique({ where: { email: body.data.email } });
  if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
    return apiError(401, "Incorrect email or password");
  }
  if (user.status === "SUSPENDED") {
    return apiError(403, "This account has been suspended. Contact support.");
  }

  await createSession(user.id);
  const redirect = user.onboardedAt || user.role !== "LEARNER" ? "/dashboard" : "/welcome";
  return json({ ok: true, redirect });
}
