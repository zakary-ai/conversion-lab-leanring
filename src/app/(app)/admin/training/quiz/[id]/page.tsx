import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { QuizEditor } from "@/components/admin/training/QuizEditor";

export const metadata = { title: "Admin · Quiz Editor" };

export default async function AdminQuizPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;
  const quiz = await db.quiz.findUnique({
    where: { id },
    include: {
      module: { select: { courseId: true, title: true, starReward: true } },
      questions: {
        orderBy: { sortOrder: "asc" },
        include: { answers: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!quiz) notFound();

  return (
    <QuizEditor
      quiz={{
        id: quiz.id,
        title: quiz.title,
        description: quiz.description ?? "",
        passingScore: quiz.passingScore,
        allowRetry: quiz.allowRetry,
        maxAttempts: quiz.maxAttempts,
        status: quiz.status,
        courseId: quiz.module.courseId,
        moduleTitle: quiz.module.title,
        moduleStarReward: quiz.module.starReward,
        questions: quiz.questions.map((q) => ({
          type: q.type,
          prompt: q.prompt,
          explanation: q.explanation ?? "",
          answers: q.answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect })),
        })),
      }}
    />
  );
}
