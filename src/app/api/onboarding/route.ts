import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json } from "@/lib/api";

const schema = z.object({
  headline: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(1000).optional(),
});

export async function POST(req: Request) {
  return withAuth(async (user) => {
    const body = schema.parse(await req.json().catch(() => ({})));
    await db.$transaction([
      db.profile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...body },
        update: body,
      }),
      db.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } }),
    ]);

    // Find the learner's first lesson so onboarding can land directly in training
    const firstLesson = await db.lesson.findFirst({
      where: {
        status: "PUBLISHED",
        module: { status: "PUBLISHED", minStars: 0, course: { status: "PUBLISHED", minStars: 0 } },
      },
      orderBy: [
        { module: { course: { sortOrder: "asc" } } },
        { module: { sortOrder: "asc" } },
        { sortOrder: "asc" },
      ],
      select: { id: true },
    });
    return json({
      ok: true,
      redirect: firstLesson ? `/training/lesson/${firstLesson.id}` : "/dashboard",
    });
  });
}
