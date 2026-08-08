import { db } from "./db";
import { grantAutomaticReward } from "./stars";
import { isModuleCompleted } from "./access";
import { notify } from "./notifications";

/**
 * Progress engine: lesson completion → module completion check → automatic
 * star award (exactly once, guarded by the ledger's unique constraint).
 */

export async function startLesson(userId: string, lessonId: string) {
  return db.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId },
    update: {},
  });
}

export async function completeLesson(userId: string, lessonId: string) {
  const progress = await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });
  const lesson = await db.lesson.findUniqueOrThrow({
    where: { id: lessonId },
    select: { moduleId: true },
  });
  const award = await checkModuleCompletion(userId, lesson.moduleId);
  return { progress, award };
}

/**
 * If the module just became complete and carries a star reward, award it.
 * Safe to call repeatedly — the ledger prevents double payouts.
 */
export async function checkModuleCompletion(userId: string, moduleId: string) {
  const complete = await isModuleCompleted(userId, moduleId);
  if (!complete) return null;

  const moduleRow = await db.module.findUniqueOrThrow({
    where: { id: moduleId },
    select: { title: true, starReward: true },
  });
  if (moduleRow.starReward <= 0) return null;

  const result = await grantAutomaticReward({
    userId,
    amount: moduleRow.starReward,
    reason: `${moduleRow.title} completed`,
    sourceType: "module",
    sourceId: moduleId,
  });
  if (result) {
    return { moduleTitle: moduleRow.title, stars: moduleRow.starReward, newBalance: result.newBalance };
  }
  return null; // already rewarded
}

export type CourseProgressSummary = {
  totalLessons: number;
  completedLessons: number;
  percent: number;
};

export async function getCourseProgress(userId: string, courseId: string): Promise<CourseProgressSummary> {
  const [total, completed] = await Promise.all([
    db.lesson.count({
      where: { status: "PUBLISHED", module: { courseId, status: "PUBLISHED" } },
    }),
    db.lessonProgress.count({
      where: {
        userId,
        completedAt: { not: null },
        lesson: { status: "PUBLISHED", module: { courseId, status: "PUBLISHED" } },
      },
    }),
  ]);
  return {
    totalLessons: total,
    completedLessons: completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export async function getModuleProgress(userId: string, moduleId: string) {
  const [total, completed, quizzes] = await Promise.all([
    db.lesson.count({ where: { moduleId, status: "PUBLISHED" } }),
    db.lessonProgress.count({
      where: { userId, completedAt: { not: null }, lesson: { moduleId, status: "PUBLISHED" } },
    }),
    db.quiz.findMany({
      where: { moduleId, status: "PUBLISHED" },
      select: { id: true, title: true, attempts: { where: { userId, passed: true }, take: 1 } },
    }),
  ]);
  const quizzesPassed = quizzes.filter((q) => q.attempts.length > 0).length;
  return {
    totalLessons: total,
    completedLessons: completed,
    totalQuizzes: quizzes.length,
    quizzesPassed,
    percent:
      total + quizzes.length === 0
        ? 0
        : Math.round(((completed + quizzesPassed) / (total + quizzes.length)) * 100),
  };
}

/** The learner's "continue learning" target: first incomplete published lesson. */
export async function getContinueTarget(userId: string) {
  const courses = await db.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { sortOrder: "asc" },
    include: {
      modules: {
        where: { status: "PUBLISHED" },
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: {
            where: { status: "PUBLISHED" },
            orderBy: { sortOrder: "asc" },
            include: { progress: { where: { userId } } },
          },
        },
      },
    },
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  for (const course of courses) {
    if (course.minStars > user.starBalance) continue;
    for (const mod of course.modules) {
      if (mod.minStars > user.starBalance) continue;
      const lessons = mod.lessons;
      const incompleteIdx = lessons.findIndex((l) => !l.progress[0]?.completedAt);
      if (incompleteIdx !== -1) {
        return {
          course,
          module: mod,
          lesson: lessons[incompleteIdx],
          lessonNumber: incompleteIdx + 1,
          lessonCount: lessons.length,
          completedInModule: lessons.filter((l) => l.progress[0]?.completedAt).length,
        };
      }
    }
  }
  return null;
}

/**
 * The learner's "next star" target: first published module with a star reward
 * the user hasn't earned yet, with progress toward it.
 */
export async function getNextStarTarget(userId: string) {
  const rewarded = await db.starTransaction.findMany({
    where: { userId, type: "AUTOMATIC_REWARD", sourceType: "module" },
    select: { sourceId: true },
  });
  const rewardedIds = new Set(rewarded.map((r) => r.sourceId));
  const modules = await db.module.findMany({
    where: { status: "PUBLISHED", starReward: { gt: 0 }, course: { status: "PUBLISHED" } },
    orderBy: [{ course: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: { quizzes: { where: { status: "PUBLISHED" }, select: { id: true, title: true } } },
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  for (const mod of modules) {
    if (rewardedIds.has(mod.id)) continue;
    if (mod.minStars > user.starBalance) continue;
    const progress = await getModuleProgress(userId, mod.id);
    return { module: mod, progress };
  }
  return null;
}

/** Notify about mentions in a message: @Full Name or @first-name matches. */
export async function sendMentionNotifications(params: {
  content: string;
  authorId: string;
  authorName: string;
  channelName: string;
  channelId: string;
  candidates: { id: string; name: string }[];
}) {
  const lower = params.content.toLowerCase();
  const mentioned = params.candidates.filter(
    (u) => u.id !== params.authorId && lower.includes(`@${u.name.toLowerCase()}`)
  );
  for (const user of mentioned) {
    await notify({
      userId: user.id,
      type: "MENTION",
      title: `${params.authorName} mentioned you in #${params.channelName}`,
      body: params.content.slice(0, 140),
      linkUrl: `/community/${params.channelId}`,
    });
  }
}
