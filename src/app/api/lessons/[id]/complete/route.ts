import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { canAccessModule } from "@/lib/access";
import { completeLesson, startLesson } from "@/lib/progress";
import { buildAwardPayload } from "@/lib/award";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const lesson = await db.lesson.findUnique({
      where: { id },
      include: { module: { include: { course: true } } },
    });
    if (!lesson || lesson.status !== "PUBLISHED") return apiError(404, "Lesson not found");

    // Backend enforcement: a learner cannot complete a lesson they can't access,
    // even by calling this endpoint directly.
    const access = await canAccessModule(user, { ...lesson.module, course: lesson.module.course });
    if (!access.allowed) return apiError(403, "You don't have access to this lesson yet");

    // Completion requires the lesson to have been started (opened) first —
    // completion is an explicit learner action, not a page view.
    const existing = await db.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId: id } },
    });
    if (!existing) await startLesson(user.id, id);

    const { award } = await completeLesson(user.id, id);
    return json({
      ok: true,
      award: award ? await buildAwardPayload(user.id, award, `You've completed ${award.moduleTitle}.`) : null,
    });
  });
}
