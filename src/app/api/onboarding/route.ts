import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json } from "@/lib/api";
import { isValidTimeZone } from "@/lib/timezone";
import { timeZoneSyncWrites } from "@/lib/user-timezone";

const schema = z.object({
  headline: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(1000).optional(),
  timezone: z.string().trim().refine(isValidTimeZone, "Unknown time zone").optional(),
});

export async function POST(req: Request) {
  return withAuth(async (user) => {
    const { timezone, ...profile } = schema.parse(await req.json().catch(() => ({})));
    await db.$transaction([
      db.profile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...profile },
        update: profile,
      }),
      // The zone is an account setting rather than a profile field: it decides
      // how every time in the app is shown and is mirrored onto the person's
      // booking availability and upcoming sessions.
      db.user.update({
        where: { id: user.id },
        data: { onboardedAt: new Date(), ...(timezone ? { timezone } : {}) },
      }),
      ...(timezone ? timeZoneSyncWrites(user.id, timezone) : []),
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
