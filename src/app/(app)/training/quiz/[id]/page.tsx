import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessModule } from "@/lib/access";
import { QuizRunner } from "@/components/training/QuizRunner";
import { LockedNotice } from "@/components/ui/Locked";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const quiz = await db.quiz.findUnique({
    where: { id },
    include: {
      module: { include: { course: true } },
      // SECURITY: answer rows are selected without isCorrect — grading is server-side only
      questions: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          type: true,
          prompt: true,
          answers: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, text: true },
          },
        },
      },
      attempts: { where: { userId: user.id }, orderBy: { startedAt: "desc" } },
    },
  });
  if (!quiz || (quiz.status !== "PUBLISHED" && user.role === "LEARNER")) notFound();

  const access = await canAccessModule(user, { ...quiz.module, course: quiz.module.course });
  if (!access.allowed) {
    return (
      <div className="max-w-xl mx-auto animate-rise">
        <div className="card mt-12">
          <div className="p-6 border-b border-edge">
            <h1 className="text-xl font-bold">{quiz.title}</h1>
          </div>
          <LockedNotice
            required={access.reason === "stars" ? access.required ?? 0 : 0}
            current={user.starBalance}
            what="this assessment"
          />
          <div className="p-6 pt-0 text-center">
            <Link href="/training" className="btn btn-primary">Back to training</Link>
          </div>
        </div>
      </div>
    );
  }

  const passedAttempt = quiz.attempts.find((a) => a.passed);
  const attemptsUsed = quiz.attempts.length;
  const outOfAttempts =
    !passedAttempt &&
    ((quiz.maxAttempts !== null && attemptsUsed >= quiz.maxAttempts) ||
      (!quiz.allowRetry && attemptsUsed > 0));

  return (
    <div className="max-w-2xl mx-auto animate-rise">
      <Link
        href={`/training/course/${quiz.module.courseId}`}
        className="text-xs text-ink-dim hover:text-ink mb-4 inline-block"
      >
        ← {quiz.module.course.title}
      </Link>
      <QuizRunner
        quiz={{
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          passingScore: quiz.passingScore,
          maxAttempts: quiz.maxAttempts,
          allowRetry: quiz.allowRetry,
          questions: quiz.questions,
          moduleTitle: quiz.module.title,
          courseId: quiz.module.courseId,
        }}
        attemptsUsed={attemptsUsed}
        bestScore={quiz.attempts.reduce((max, a) => Math.max(max, a.score), 0)}
        alreadyPassed={Boolean(passedAttempt)}
        outOfAttempts={outOfAttempts}
      />
    </div>
  );
}
