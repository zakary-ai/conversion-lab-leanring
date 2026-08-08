import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { canAccessModule } from "@/lib/access";
import { startLesson } from "@/lib/progress";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const lesson = await db.lesson.findUnique({
      where: { id },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) return apiError(404, "Lesson not found");
    const access = await canAccessModule(user, { ...lesson.module, course: lesson.module.course });
    if (!access.allowed) return apiError(403, "You don't have access to this lesson yet");
    await startLesson(user.id, id);
    return json({ ok: true });
  });
}
