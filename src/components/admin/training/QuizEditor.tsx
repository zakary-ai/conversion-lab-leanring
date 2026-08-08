"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";

type QuestionDraft = {
  type: "MULTIPLE_CHOICE" | "MULTIPLE_SELECT" | "TRUE_FALSE";
  prompt: string;
  explanation: string;
  answers: { text: string; isCorrect: boolean }[];
};

type QuizDraft = {
  id: string;
  title: string;
  description: string;
  passingScore: number;
  allowRetry: boolean;
  maxAttempts: number | null;
  status: string;
  courseId: string;
  moduleTitle: string;
  moduleStarReward: number;
  questions: QuestionDraft[];
};

export function QuizEditor({ quiz }: { quiz: QuizDraft }) {
  const router = useRouter();
  const [title, setTitle] = useState(quiz.title);
  const [description, setDescription] = useState(quiz.description);
  const [passingScore, setPassingScore] = useState(quiz.passingScore);
  const [allowRetry, setAllowRetry] = useState(quiz.allowRetry);
  const [maxAttempts, setMaxAttempts] = useState(quiz.maxAttempts?.toString() ?? "");
  const [questions, setQuestions] = useState<QuestionDraft[]>(quiz.questions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function addQuestion(type: QuestionDraft["type"]) {
    const base: QuestionDraft =
      type === "TRUE_FALSE"
        ? {
            type,
            prompt: "",
            explanation: "",
            answers: [
              { text: "True", isCorrect: true },
              { text: "False", isCorrect: false },
            ],
          }
        : {
            type,
            prompt: "",
            explanation: "",
            answers: [
              { text: "", isCorrect: true },
              { text: "", isCorrect: false },
              { text: "", isCorrect: false },
            ],
          };
    setQuestions((qs) => [...qs, base]);
  }

  async function save(status?: "PUBLISHED" | "DRAFT") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/quizzes/${quiz.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          passingScore,
          allowRetry,
          maxAttempts: maxAttempts ? Number(maxAttempts) : null,
          ...(status ? { status } : {}),
          questions: questions.map((q) => ({
            type: q.type,
            prompt: q.prompt.trim(),
            explanation: q.explanation.trim() || null,
            answers: q.answers.filter((a) => a.text.trim()).map((a) => ({ ...a, text: a.text.trim() })),
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save quiz");
        return;
      }
      setMessage(status === "PUBLISHED" ? "Quiz published ✓" : "Saved ✓");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise max-w-3xl">
      <Link
        href={`/admin/training/course/${quiz.courseId}`}
        className="text-xs text-ink-dim hover:text-ink mb-4 inline-block"
      >
        ← Back to course builder
      </Link>

      <div className="card p-6 mb-5">
        <p className="section-title mb-3">{quiz.moduleTitle} · Assessment</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Quiz title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea className="input min-h-16 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">Passing score (%)</label>
            <input className="input" type="number" min={1} max={100} value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value) || 80)} />
          </div>
          <div>
            <label className="label">Max attempts (empty = unlimited)</label>
            <input className="input" type="number" min={1} value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)} disabled={!allowRetry} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowRetry} onChange={(e) => setAllowRetry(e.target.checked)} />
            Allow retries
          </label>
          <p className="text-xs text-ink-dim self-center">
            Passing this quiz counts toward module completion
            {quiz.moduleStarReward > 0 && ` — worth ⭐ ${quiz.moduleStarReward} on module completion`}
            .
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q, qi) => (
          <div key={qi} className="card p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-overlay border border-edge text-xs font-bold">
                {qi + 1}
              </span>
              <div className="flex-1 space-y-3">
                <div className="flex gap-2 items-center flex-wrap">
                  <select
                    className="input py-1 px-2 text-xs w-auto"
                    value={q.type}
                    onChange={(e) => {
                      const type = e.target.value as QuestionDraft["type"];
                      if (type === "TRUE_FALSE") {
                        updateQuestion(qi, {
                          type,
                          answers: [
                            { text: "True", isCorrect: true },
                            { text: "False", isCorrect: false },
                          ],
                        });
                      } else {
                        updateQuestion(qi, { type });
                      }
                    }}
                  >
                    <option value="MULTIPLE_CHOICE">Multiple choice</option>
                    <option value="MULTIPLE_SELECT">Multiple select</option>
                    <option value="TRUE_FALSE">True / False</option>
                  </select>
                  <button
                    className="btn btn-ghost btn-sm hover:text-bad ml-auto"
                    onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))}
                  >
                    <Icons.trash className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea
                  className="input resize-y"
                  placeholder="Question prompt"
                  value={q.prompt}
                  onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                />
                <div className="space-y-2">
                  {q.answers.map((a, ai) => (
                    <div key={ai} className="flex items-center gap-2">
                      <input
                        type={q.type === "MULTIPLE_SELECT" ? "checkbox" : "radio"}
                        name={`correct-${qi}`}
                        checked={a.isCorrect}
                        onChange={() => {
                          updateQuestion(qi, {
                            answers: q.answers.map((x, i) =>
                              q.type === "MULTIPLE_SELECT"
                                ? i === ai
                                  ? { ...x, isCorrect: !x.isCorrect }
                                  : x
                                : { ...x, isCorrect: i === ai }
                            ),
                          });
                        }}
                        title="Correct answer"
                      />
                      <input
                        className="input py-1.5"
                        placeholder={`Answer ${ai + 1}`}
                        value={a.text}
                        disabled={q.type === "TRUE_FALSE"}
                        onChange={(e) =>
                          updateQuestion(qi, {
                            answers: q.answers.map((x, i) => (i === ai ? { ...x, text: e.target.value } : x)),
                          })
                        }
                      />
                      {q.type !== "TRUE_FALSE" && q.answers.length > 2 && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            updateQuestion(qi, { answers: q.answers.filter((_, i) => i !== ai) })
                          }
                        >
                          <Icons.x className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {q.type !== "TRUE_FALSE" && q.answers.length < 8 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        updateQuestion(qi, { answers: [...q.answers, { text: "", isCorrect: false }] })
                      }
                    >
                      <Icons.plus className="h-3.5 w-3.5" />
                      Add answer
                    </button>
                  )}
                </div>
                <input
                  className="input py-1.5 text-sm"
                  placeholder="Explanation shown after answering (optional)"
                  value={q.explanation}
                  onChange={(e) => updateQuestion(qi, { explanation: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        <button className="btn btn-secondary btn-sm" onClick={() => addQuestion("MULTIPLE_CHOICE")}>
          <Icons.plus className="h-3.5 w-3.5" /> Multiple choice
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => addQuestion("MULTIPLE_SELECT")}>
          <Icons.plus className="h-3.5 w-3.5" /> Multiple select
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => addQuestion("TRUE_FALSE")}>
          <Icons.plus className="h-3.5 w-3.5" /> True / False
        </button>
      </div>

      <div className="sticky bottom-0 bg-bg/90 backdrop-blur border-t border-edge mt-8 -mx-4 px-4 py-4 flex items-center gap-3">
        <button className="btn btn-secondary" onClick={() => void save()} disabled={busy}>
          Save draft
        </button>
        <button
          className="btn btn-primary"
          onClick={() => void save("PUBLISHED")}
          disabled={busy || questions.length === 0}
        >
          {quiz.status === "PUBLISHED" ? "Save & keep published" : "Save & publish"}
        </button>
        {message && <span className="text-sm text-good">{message}</span>}
        {error && <span className="text-sm text-bad">{error}</span>}
        <span className="text-xs text-ink-dim ml-auto">{questions.length} questions</span>
      </div>
    </div>
  );
}
