import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { canAccessModule } from "@/lib/access";
import { checkModuleCompletion } from "@/lib/progress";
import { buildAwardPayload } from "@/lib/award";
import { notify } from "@/lib/notifications";

const schema = z.object({
  // { [questionId]: answerId[] }
  responses: z.record(z.string(), z.array(z.string())),
});

/**
 * Grade a quiz attempt entirely server-side. Correct answers never reach the
 * client before submission, and star rewards flow through the ledger's
 * idempotent automatic-reward path.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) return apiError(400, "Invalid submission");

    const quiz = await db.quiz.findUnique({
      where: { id },
      include: {
        questions: { include: { answers: true }, orderBy: { sortOrder: "asc" } },
        module: { include: { course: true } },
      },
    });
    if (!quiz || quiz.status !== "PUBLISHED") return apiError(404, "Quiz not found");

    const access = await canAccessModule(user, { ...quiz.module, course: quiz.module.course });
    if (!access.allowed) return apiError(403, "You don't have access to this assessment yet");

    // Retry rules
    const attemptCount = await db.quizAttempt.count({ where: { quizId: id, userId: user.id } });
    const alreadyPassed = await db.quizAttempt.findFirst({
      where: { quizId: id, userId: user.id, passed: true },
    });
    if (attemptCount > 0 && !quiz.allowRetry && !alreadyPassed) {
      return apiError(403, "Retries are not allowed for this assessment");
    }
    if (quiz.maxAttempts && attemptCount >= quiz.maxAttempts && !alreadyPassed) {
      return apiError(403, "You've used all your attempts for this assessment");
    }

    // Grade
    let correct = 0;
    const review: {
      questionId: string;
      correct: boolean;
      correctAnswerIds: string[];
      explanation: string | null;
    }[] = [];
    for (const question of quiz.questions) {
      const chosen = new Set(body.data.responses[question.id] ?? []);
      const correctIds = question.answers.filter((a) => a.isCorrect).map((a) => a.id);
      const isCorrect =
        chosen.size === correctIds.length && correctIds.every((cid) => chosen.has(cid));
      if (isCorrect) correct++;
      review.push({
        questionId: question.id,
        correct: isCorrect,
        correctAnswerIds: correctIds,
        explanation: question.explanation,
      });
    }
    const score =
      quiz.questions.length === 0 ? 0 : Math.round((correct / quiz.questions.length) * 100);
    const passed = score >= quiz.passingScore;

    await db.quizAttempt.create({
      data: {
        quizId: id,
        userId: user.id,
        score,
        passed,
        responses: body.data.responses,
        completedAt: new Date(),
      },
    });

    await notify({
      userId: user.id,
      type: "QUIZ_RESULT",
      title: passed ? `Passed: ${quiz.title} (${score}%)` : `${quiz.title}: ${score}%`,
      body: passed
        ? "Assessment complete."
        : `You need ${quiz.passingScore}% to pass. Review the lessons and try again.`,
      linkUrl: `/training/quiz/${id}`,
    });

    // Passing may complete the module → automatic star via the ledger
    let award = null;
    if (passed) {
      const result = await checkModuleCompletion(user.id, quiz.moduleId);
      if (result) {
        award = await buildAwardPayload(user.id, result, `You've completed ${result.moduleTitle}.`);
      }
    }

    return json({
      score,
      passed,
      passingScore: quiz.passingScore,
      correctCount: correct,
      totalQuestions: quiz.questions.length,
      review,
      award,
    });
  });
}
