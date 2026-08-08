import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return apiError(400, body.error.issues[0]?.message ?? "Invalid input");
  }
  const { name, email, password } = body.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return apiError(409, "An account with this email already exists");

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "LEARNER",
      profile: { create: {} },
    },
  });

  // Auto-enroll in courses that are open at 0 stars
  const openCourses = await db.course.findMany({
    where: { status: "PUBLISHED", minStars: 0 },
    select: { id: true },
  });
  if (openCourses.length > 0) {
    await db.enrollment.createMany({
      data: openCourses.map((c) => ({ userId: user.id, courseId: c.id })),
      skipDuplicates: true,
    });
  }

  await audit({ actorId: user.id, action: "user.signup", entityType: "user", entityId: user.id });
  await createSession(user.id);
  return json({ ok: true, redirect: "/welcome" });
}
