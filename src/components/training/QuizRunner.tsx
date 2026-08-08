"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";
import { StarCelebration, type AwardPayload } from "./StarCelebration";

type Question = {
  id: string;
  type: "MULTIPLE_CHOICE" | "MULTIPLE_SELECT" | "TRUE_FALSE";
  prompt: string;
  answers: { id: string; text: string }[];
};

type QuizData = {
  id: string;
  title: string;
  description: string | null;
  passingScore: number;
  maxAttempts: number | null;
  allowRetry: boolean;
  questions: Question[];
  moduleTitle: string;
  courseId: string;
};

type Result = {
  score: number;
  passed: boolean;
  passingScore: number;
  correctCount: number;
  totalQuestions: number;
  review: {
    questionId: string;
    correct: boolean;
    correctAnswerIds: string[];
    explanation: string | null;
  }[];
  award: AwardPayload | null;
};

export function QuizRunner({
  quiz,
  attemptsUsed,
  bestScore,
  alreadyPassed,
  outOfAttempts,
}: {
  quiz: QuizData;
  attemptsUsed: number;
  bestScore: number;
  alreadyPassed: boolean;
  outOfAttempts: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "taking" | "result">("intro");
  const [responses, setResponses] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [award, setAward] = useState<AwardPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(question: Question, answerId: string) {
    setResponses((prev) => {
      const current = prev[question.id] ?? [];
      if (question.type === "MULTIPLE_SELECT") {
        return {
          ...prev,
          [question.id]: current.includes(answerId)
            ? current.filter((a) => a !== answerId)
            : [...current, answerId],
        };
      }
      return { ...prev, [question.id]: [answerId] };
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses }),
      });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Submission failed");
        return;
      }
      setResult(data);
      setPhase("result");
      if (data.award) setAward(data.award);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const answeredCount = quiz.questions.filter((q) => (responses[q.id] ?? []).length > 0).length;
  const attemptsLabel = quiz.maxAttempts
    ? `Attempt ${attemptsUsed + 1} of ${quiz.maxAttempts}`
    : `Attempt ${attemptsUsed + 1} of Unlimited`;

  if (phase === "intro") {
    return (
      <div className="card p-8 text-center">
        <p className="section-title">{quiz.moduleTitle} · Assessment</p>
        <h1 className="text-2xl font-bold tracking-tight mt-2">{quiz.title}</h1>
        {quiz.description && <p className="text-sm text-ink-mid mt-3">{quiz.description}</p>}
        <div className="flex items-center justify-center gap-6 mt-6 text-sm text-ink-mid">
          <span>{quiz.questions.length} Questions</span>
          <span>Passing score: {quiz.passingScore}%</span>
          <span>{attemptsLabel}</span>
        </div>
        {alreadyPassed && (
          <p className="chip chip-good mx-auto mt-5">
            <Icons.check className="h-3 w-3" />
            Passed · best score {bestScore}%
          </p>
        )}
        {outOfAttempts ? (
          <div className="mt-6">
            <p className="text-sm text-bad">You&apos;ve used all available attempts.</p>
            <Link href={`/training/course/${quiz.courseId}`} className="btn btn-secondary mt-4">
              Back to course
            </Link>
          </div>
        ) : (
          <button
            className="btn btn-primary text-base px-8 py-3 mt-7"
            onClick={() => setPhase("taking")}
          >
            {alreadyPassed ? "Retake assessment" : attemptsUsed > 0 ? "Try again" : "Start assessment"}
          </button>
        )}
      </div>
    );
  }

  if (phase === "result" && result) {
    return (
      <>
        {award && <StarCelebration award={award} onClose={() => setAward(null)} />}
        <div className="card p-8 text-center animate-pop">
          {result.passed ? (
            <>
              <p className="text-4xl mb-2">🎉</p>
              <p className="section-title text-good">Passed</p>
            </>
          ) : (
            <p className="section-title text-bad mt-2">Not yet</p>
          )}
          <p className="text-6xl font-bold tracking-tight mt-3">
            {result.score}
            <span className="text-2xl text-ink-mid">%</span>
          </p>
          <p className="text-sm text-ink-mid mt-2">
            {result.correctCount} of {result.totalQuestions} correct
            {!result.passed && ` — you need ${result.passingScore}% to pass`}
          </p>
          {result.passed ? (
            <p className="chip chip-good mx-auto mt-4">Module assessment complete</p>
          ) : (
            <p className="text-sm text-ink-mid mt-4">Review the lessons and try again.</p>
          )}
          <div className="flex justify-center gap-3 mt-7">
            <Link href={`/training/course/${quiz.courseId}`} className="btn btn-secondary">
              Back to course
            </Link>
            {!result.passed && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setResponses({});
                  setResult(null);
                  setPhase("taking");
                }}
              >
                Try again
              </button>
            )}
          </div>
        </div>

        {/* Answer review with explanations */}
        <div className="mt-6 space-y-4">
          <p className="section-title">Review</p>
          {quiz.questions.map((q, i) => {
            const r = result.review.find((x) => x.questionId === q.id);
            if (!r) return null;
            const chosen = new Set(responses[q.id] ?? []);
            return (
              <div key={q.id} className={`card p-5 border ${r.correct ? "border-good/25" : "border-bad/25"}`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                      r.correct ? "bg-good/15 text-good" : "bg-bad/15 text-bad"
                    }`}
                  >
                    {r.correct ? <Icons.check className="h-3 w-3" /> : <Icons.x className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {i + 1}. {q.prompt}
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {q.answers.map((a) => {
                        const isCorrectAnswer = r.correctAnswerIds.includes(a.id);
                        const wasChosen = chosen.has(a.id);
                        return (
                          <li
                            key={a.id}
                            className={`text-sm rounded-lg px-3 py-1.5 ${
                              isCorrectAnswer
                                ? "bg-good/10 text-good"
                                : wasChosen
                                  ? "bg-bad/10 text-bad line-through"
                                  : "text-ink-dim"
                            }`}
                          >
                            {a.text}
                            {isCorrectAnswer && " ✓"}
                          </li>
                        );
                      })}
                    </ul>
                    {r.explanation && (
                      <p className="text-xs text-ink-mid mt-3 bg-overlay rounded-lg px-3 py-2">
                        {r.explanation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="animate-rise">
      <div className="card p-6 mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold">{quiz.title}</h1>
          <p className="text-xs text-ink-dim mt-0.5">
            {answeredCount} / {quiz.questions.length} answered · Passing score {quiz.passingScore}%
          </p>
        </div>
        <span className="chip">{attemptsLabel}</span>
      </div>

      <div className="space-y-4">
        {quiz.questions.map((q, i) => (
          <div key={q.id} className="card p-6">
            <p className="font-semibold text-sm">
              {i + 1}. {q.prompt}
            </p>
            {q.type === "MULTIPLE_SELECT" && (
              <p className="text-xs text-ink-dim mt-1">Select all that apply</p>
            )}
            <div className="mt-4 space-y-2">
              {q.answers.map((a) => {
                const selected = (responses[q.id] ?? []).includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggle(q, a.id)}
                    className={`w-full text-left text-sm rounded-xl border px-4 py-3 transition-all ${
                      selected
                        ? "border-accent/60 bg-accent/10 text-ink font-medium"
                        : "border-edge bg-raised hover:border-edge-strong text-ink-mid"
                    }`}
                  >
                    <span
                      className={`inline-block mr-3 h-3.5 w-3.5 align-[-2px] border transition-colors ${
                        q.type === "MULTIPLE_SELECT" ? "rounded" : "rounded-full"
                      } ${selected ? "bg-accent border-accent" : "border-edge-strong"}`}
                    />
                    {a.text}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-bad mt-4">{error}</p>}
      <div className="mt-6 flex items-center justify-between">
        <button className="btn btn-ghost" onClick={() => setPhase("intro")}>
          Cancel
        </button>
        <button
          className="btn btn-primary px-8"
          disabled={answeredCount < quiz.questions.length || submitting}
          onClick={() => void submit()}
        >
          {submitting
            ? "Grading…"
            : answeredCount < quiz.questions.length
              ? `Answer ${quiz.questions.length - answeredCount} more`
              : "Submit assessment"}
        </button>
      </div>
    </div>
  );
}
