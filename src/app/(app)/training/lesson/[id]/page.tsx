import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessModule } from "@/lib/access";
import { VideoPlayer } from "@/components/training/VideoPlayer";
import { CompleteLessonButton, LessonStartTracker } from "@/components/training/LessonClient";
import { LockedNotice } from "@/components/ui/Locked";
import { Icons } from "@/components/ui/icons";
import { StarIcon } from "@/components/ui/Star";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lesson = await db.lesson.findUnique({
    where: { id },
    include: {
      videoAsset: true,
      resources: true,
      module: {
        include: {
          course: true,
          lessons: {
            where: { status: "PUBLISHED" },
            orderBy: { sortOrder: "asc" },
            include: { progress: { where: { userId: user.id } } },
          },
          quizzes: {
            where: { status: "PUBLISHED" },
            include: { attempts: { where: { userId: user.id, passed: true }, take: 1 } },
          },
        },
      },
      progress: { where: { userId: user.id } },
    },
  });
  if (!lesson || (lesson.status !== "PUBLISHED" && user.role === "LEARNER")) notFound();

  const access = await canAccessModule(user, { ...lesson.module, course: lesson.module.course });
  if (!access.allowed) {
    return (
      <div className="max-w-xl mx-auto animate-rise">
        <div className="card mt-12">
          <div className="p-6 border-b border-edge">
            <h1 className="text-xl font-bold">{lesson.title}</h1>
            <p className="text-sm text-ink-mid mt-1">
              {lesson.module.course.title} · {lesson.module.title}
            </p>
          </div>
          {access.reason === "prerequisite" ? (
            <div className="text-center py-10 px-6">
              <p className="font-semibold">Complete {access.prerequisiteTitle} first</p>
              <p className="text-sm text-ink-mid mt-1">
                This module builds on earlier material. Finish the prerequisite to unlock it.
              </p>
            </div>
          ) : (
            <LockedNotice
              required={access.reason === "stars" ? access.required ?? 0 : 0}
              current={user.starBalance}
              what="this lesson"
            />
          )}
          <div className="p-6 pt-0 text-center">
            <Link href={`/training/course/${lesson.module.courseId}`} className="btn btn-primary">
              Back to course
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const lessons = lesson.module.lessons;
  const idx = lessons.findIndex((l) => l.id === lesson.id);
  const next = lessons[idx + 1];
  const firstQuiz = lesson.module.quizzes[0];
  const nextHref = next
    ? `/training/lesson/${next.id}`
    : firstQuiz && firstQuiz.attempts.length === 0
      ? `/training/quiz/${firstQuiz.id}`
      : null;
  const completed = Boolean(lesson.progress[0]?.completedAt);

  return (
    <div className="animate-rise">
      <LessonStartTracker lessonId={lesson.id} />
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <Link
            href={`/training/course/${lesson.module.courseId}`}
            className="text-xs text-ink-dim hover:text-ink mb-4 inline-block"
          >
            ← {lesson.module.course.title}
          </Link>

          {lesson.type === "VIDEO" && lesson.videoAsset && (
            <VideoPlayer
              asset={{
                provider: lesson.videoAsset.provider,
                reference: lesson.videoAsset.reference,
                thumbnailUrl: lesson.videoAsset.thumbnailUrl,
                title: lesson.title,
              }}
            />
          )}

          <div className="mt-6">
            <p className="text-xs text-ink-dim font-semibold">
              {lesson.module.title} · Lesson {idx + 1} of {lessons.length}
            </p>
            <h1 className="text-2xl font-bold tracking-tight mt-1">{lesson.title}</h1>
            {lesson.description && (
              <p className="prose-sm-invert mt-3 whitespace-pre-line">{lesson.description}</p>
            )}
            {lesson.type === "TEXT" && lesson.content && (
              <div className="card p-6 mt-5 prose-sm-invert whitespace-pre-line">{lesson.content}</div>
            )}
            {lesson.type === "LINK" && lesson.linkUrl && (
              <a href={lesson.linkUrl} target="_blank" rel="noreferrer" className="btn btn-secondary mt-5">
                <Icons.external />
                Open lesson link
              </a>
            )}
            {lesson.type === "DOCUMENT" && lesson.fileUrl && (
              <a href={lesson.fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary mt-5">
                <Icons.download />
                Download document
              </a>
            )}
          </div>

          {lesson.resources.length > 0 && (
            <div className="mt-8">
              <p className="section-title mb-3">Lesson resources</p>
              <ul className="space-y-2">
                {lesson.resources.map((r) => (
                  <li key={r.id}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="card card-hover flex items-center gap-3 px-4 py-3 text-sm font-medium"
                    >
                      {r.kind === "link" ? <Icons.external /> : <Icons.download />}
                      {r.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-10 border-t border-edge pt-6">
            <CompleteLessonButton
              lessonId={lesson.id}
              initiallyCompleted={completed}
              nextHref={nextHref}
            />
          </div>
        </div>

        {/* Module outline sidebar */}
        <aside className="lg:sticky lg:top-24 self-start card p-4 order-first lg:order-none">
          <p className="section-title px-2 mb-3">{lesson.module.title}</p>
          <ul className="space-y-0.5">
            {lessons.map((l, i) => {
              const done = Boolean(l.progress[0]?.completedAt);
              const current = l.id === lesson.id;
              return (
                <li key={l.id}>
                  <Link
                    href={`/training/lesson/${l.id}`}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${
                      current ? "bg-overlay font-semibold" : "text-ink-mid hover:bg-overlay/60"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] border ${
                        done
                          ? "bg-good/15 text-good border-good/30"
                          : current
                            ? "bg-accent/15 text-accent-hi border-accent/30"
                            : "bg-overlay text-ink-dim border-edge"
                      }`}
                    >
                      {done ? <Icons.check className="h-2.5 w-2.5" /> : i + 1}
                    </span>
                    <span className="truncate">{l.title}</span>
                  </Link>
                </li>
              );
            })}
            {lesson.module.quizzes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/training/quiz/${q.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-mid hover:bg-overlay/60 transition-colors"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      q.attempts.length > 0
                        ? "bg-good/15 text-good border-good/30"
                        : "bg-accent/10 text-accent-hi border-accent/25"
                    }`}
                  >
                    {q.attempts.length > 0 ? (
                      <Icons.check className="h-2.5 w-2.5" />
                    ) : (
                      <StarIcon className="h-2.5 w-2.5" filled={false} />
                    )}
                  </span>
                  <span className="truncate">{q.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
