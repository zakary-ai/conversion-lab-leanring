import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessCourse } from "@/lib/access";
import { getCourseProgress } from "@/lib/progress";
import { ProgressBar } from "@/components/ui/Progress";
import { LockChip, LockOverlay } from "@/components/ui/Locked";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icons } from "@/components/ui/icons";

export const metadata = { title: "Training" };

export default async function TrainingPage() {
  const user = await requireUser();
  const courses = await db.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { sortOrder: "asc" },
    include: {
      modules: {
        where: { status: "PUBLISHED" },
        select: { id: true, starReward: true },
      },
    },
  });

  const withProgress = await Promise.all(
    courses.map(async (course) => ({
      course,
      access: canAccessCourse(user, course),
      progress: await getCourseProgress(user.id, course.id),
    }))
  );

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Training</h1>
        <p className="text-ink-mid text-sm mt-1">
          Work through the program in order. Every module you finish moves you closer to your next
          Star.
        </p>
      </header>

      {withProgress.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icons.training className="h-6 w-6" />}
            title="No training published yet"
            message="Your training program is being prepared. Check back soon."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {withProgress.map(({ course, access, progress }) => {
            const totalStars = course.modules.reduce((sum, m) => sum + m.starReward, 0);
            const inner = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-lg leading-snug">{course.title}</h2>
                    {course.description && (
                      <p className="text-sm text-ink-mid mt-1.5 line-clamp-2">{course.description}</p>
                    )}
                  </div>
                  {!access.allowed && access.reason === "stars" && (
                    <LockChip required={access.required ?? 0} />
                  )}
                </div>
                <div className="mt-5 flex items-center gap-4 text-xs text-ink-dim">
                  <span>{course.modules.length} modules</span>
                  <span>{progress.totalLessons} lessons</span>
                  {totalStars > 0 && <span className="text-accent-hi">⭐ {totalStars} to earn</span>}
                </div>
                {access.allowed ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-ink-mid">
                        {progress.completedLessons} / {progress.totalLessons} lessons
                      </span>
                      <span className="font-semibold text-ink">{progress.percent}%</span>
                    </div>
                    <ProgressBar percent={progress.percent} />
                  </div>
                ) : (
                  <div className="mt-4 text-xs text-ink-dim">Locked</div>
                )}
              </>
            );

            return access.allowed ? (
              <Link
                key={course.id}
                href={`/training/course/${course.id}`}
                className="card card-hover p-6 block"
              >
                {inner}
              </Link>
            ) : (
              <div key={course.id} className="card p-6 relative overflow-hidden" aria-label={`${course.title} (locked)`}>
                {inner}
                <LockOverlay
                  required={access.reason === "stars" ? access.required ?? 0 : 0}
                  current={user.starBalance}
                  what="this program"
                  title={course.title}
                  message={access.reason === "stars" ? undefined : "This program isn't available to you yet."}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
