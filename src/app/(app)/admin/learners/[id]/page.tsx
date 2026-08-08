import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStarHistory } from "@/lib/stars";
import { enumLabel, formatDateShort, timeAgo } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { StarIcon } from "@/components/ui/Star";
import { UserAdminControls } from "@/components/admin/learners/UserAdminControls";

export const metadata = { title: "Admin · Learner" };

export default async function AdminLearnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireRole("ADMIN");
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      profile: true,
      lessonProgress: {
        where: { completedAt: { not: null } },
        include: { lesson: { select: { title: true, module: { select: { title: true } } } } },
        orderBy: { completedAt: "desc" },
        take: 8,
      },
      quizAttempts: {
        orderBy: { startedAt: "desc" },
        take: 8,
        include: { quiz: { select: { title: true } } },
      },
    },
  });
  if (!user) notFound();

  const [history, publishedLessons, completedCount] = await Promise.all([
    getStarHistory(id),
    db.lesson.count({ where: { status: "PUBLISHED" } }),
    db.lessonProgress.count({ where: { userId: id, completedAt: { not: null } } }),
  ]);
  const progress = publishedLessons === 0 ? 0 : Math.round((completedCount / publishedLessons) * 100);
  const automaticStars = history.filter((t) => t.type === "AUTOMATIC_REWARD" && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const manualStars = history.filter((t) => t.type !== "AUTOMATIC_REWARD").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="animate-rise max-w-4xl">
      <Link href="/admin/learners" className="text-xs text-ink-dim hover:text-ink mb-4 inline-block">
        ← All learners
      </Link>

      <div className="card p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <Avatar name={user.name} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
            {user.name}
            <span className="chip">{enumLabel(user.role)}</span>
            {user.status === "SUSPENDED" && <span className="chip chip-bad">Suspended</span>}
          </h1>
          <p className="text-sm text-ink-mid">{user.email}</p>
          <p className="text-xs text-ink-dim mt-1">
            Joined {formatDateShort(user.createdAt)} · Last active{" "}
            {user.lastActiveAt ? timeAgo(user.lastActiveAt) : "never"}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="card-raised px-4 py-3">
            <p className="text-xl font-bold text-accent-hi flex items-center justify-center gap-1">
              <StarIcon className="h-4 w-4" />
              {user.starBalance}
            </p>
            <p className="text-[10px] text-ink-dim uppercase tracking-wide mt-0.5">Stars</p>
          </div>
          <div className="card-raised px-4 py-3">
            <p className="text-xl font-bold">{progress}%</p>
            <p className="text-[10px] text-ink-dim uppercase tracking-wide mt-0.5">Progress</p>
          </div>
          <div className="card-raised px-4 py-3">
            <p className="text-xl font-bold">{user.quizAttempts.filter((a) => a.passed).length}</p>
            <p className="text-[10px] text-ink-dim uppercase tracking-wide mt-0.5">Quizzes passed</p>
          </div>
        </div>
      </div>

      <UserAdminControls
        user={{ id: user.id, name: user.name, role: user.role, status: user.status }}
        actorRole={actor.role}
      />

      <div className="grid gap-6 md:grid-cols-2 mt-6">
        <section className="card p-6">
          <p className="section-title mb-1">Star history</p>
          <p className="text-xs text-ink-dim mb-4">
            {automaticStars} automatic · {manualStars >= 0 ? "+" : ""}{manualStars} manual
          </p>
          {history.length === 0 ? (
            <p className="text-sm text-ink-mid">No star activity yet.</p>
          ) : (
            <ul className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {history.map((tx) => (
                <li key={tx.id} className="flex items-start gap-3 text-sm">
                  <span
                    className={`font-bold shrink-0 w-9 text-center rounded-lg py-0.5 ${
                      tx.amount > 0 ? "text-good bg-good/10" : "text-bad bg-bad/10"
                    }`}
                  >
                    {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{tx.reason}</span>
                    <span className="block text-xs text-ink-dim mt-0.5">
                      {tx.type === "AUTOMATIC_REWARD"
                        ? "Automatic"
                        : `Manual by ${tx.createdBy?.name ?? "admin"}`}{" "}
                      · {formatDateShort(tx.createdAt)} · balance {tx.previousBalance} → {tx.newBalance}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <p className="section-title mb-4">Recent quiz performance</p>
            {user.quizAttempts.length === 0 ? (
              <p className="text-sm text-ink-mid">No quiz attempts yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {user.quizAttempts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    <span className={`chip ${a.passed ? "chip-good" : "chip-bad"} shrink-0`}>
                      {a.score}%
                    </span>
                    <span className="truncate">{a.quiz.title}</span>
                    <span className="text-xs text-ink-dim ml-auto shrink-0">
                      {formatDateShort(a.startedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-6">
            <p className="section-title mb-4">Recently completed lessons</p>
            {user.lessonProgress.length === 0 ? (
              <p className="text-sm text-ink-mid">No lessons completed yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {user.lessonProgress.map((p) => (
                  <li key={p.id} className="text-sm">
                    <span className="font-medium">{p.lesson.title}</span>
                    <span className="text-xs text-ink-dim block">
                      {p.lesson.module.title} · {p.completedAt ? formatDateShort(p.completedAt) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
