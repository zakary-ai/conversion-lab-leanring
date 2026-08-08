import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";

const questionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["MULTIPLE_CHOICE", "MULTIPLE_SELECT", "TRUE_FALSE"]),
  prompt: z.string().trim().min(1).max(2000),
  explanation: z.string().trim().max(2000).nullable().optional(),
  answers: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(500),
        isCorrect: z.boolean(),
      })
    )
    .min(2)
    .max(10),
});

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  passingScore: z.number().int().min(1).max(100).optional(),
  allowRetry: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).max(100).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  // Full replacement of the question set when provided
  questions: z.array(questionSchema).max(100).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const { questions, ...quizFields } = body;

    for (const q of questions ?? []) {
      const correctCount = q.answers.filter((a) => a.isCorrect).length;
      if (correctCount === 0) return apiError(400, `"${q.prompt.slice(0, 40)}" needs a correct answer`);
      if (q.type !== "MULTIPLE_SELECT" && correctCount > 1) {
        return apiError(400, `"${q.prompt.slice(0, 40)}" can only have one correct answer`);
      }
    }

    const quiz = await db.$transaction(async (tx) => {
      const updated = await tx.quiz.update({ where: { id }, data: quizFields });
      if (questions) {
        await tx.quizQuestion.deleteMany({ where: { quizId: id } });
        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi];
          await tx.quizQuestion.create({
            data: {
              quizId: id,
              type: q.type,
              prompt: q.prompt,
              explanation: q.explanation ?? null,
              sortOrder: qi,
              answers: {
                create: q.answers.map((a, ai) => ({
                  text: a.text,
                  isCorrect: a.isCorrect,
                  sortOrder: ai,
                })),
              },
            },
          });
        }
      }
      return updated;
    });

    if (body.status) {
      await audit({
        actorId: user.id,
        action: `quiz.${body.status.toLowerCase()}`,
        entityType: "quiz",
        entityId: id,
        details: { title: quiz.title },
      });
    }
    return json({ quiz });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const quiz = await db.quiz.findUnique({ where: { id } });
    if (!quiz) return apiError(404, "Quiz not found");
    await db.quiz.delete({ where: { id } });
    await audit({ actorId: user.id, action: "quiz.delete", entityType: "quiz", entityId: id, details: { title: quiz.title } });
    return json({ ok: true });
  });
}
