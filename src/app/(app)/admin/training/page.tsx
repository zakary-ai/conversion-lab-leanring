import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { enumLabel } from "@/lib/format";
import { CreateCourseForm } from "@/components/admin/training/CreateCourseForm";

export const metadata = { title: "Admin · Training" };

export default async function AdminTrainingPage() {
  await requireRole("ADMIN");
  const courses = await db.course.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      modules: {
        include: { lessons: { select: { id: true } }, quizzes: { select: { id: true } } },
      },
      _count: { select: { enrollments: true } },
    },
  });

  return (
    <div className="animate-rise">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Training Builder</h1>
          <p className="text-ink-mid text-sm mt-1">
            Create and structure courses, modules, lessons, and assessments.
          </p>
        </div>
        <CreateCourseForm />
      </header>

      {courses.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-semibold">No courses yet</p>
          <p className="text-sm text-ink-mid mt-1">Create your first course to start building the program.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => {
            const lessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
            const quizzes = course.modules.reduce((sum, m) => sum + m.quizzes.length, 0);
            const starTotal = course.modules.reduce((sum, m) => sum + m.starReward, 0);
            return (
              <Link
                key={course.id}
                href={`/admin/training/course/${course.id}`}
                className="card card-hover flex items-center gap-5 p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="font-bold">{course.title}</h2>
                    <span className={`chip ${course.status === "PUBLISHED" ? "chip-good" : course.status === "DRAFT" ? "chip-accent" : ""}`}>
                      {enumLabel(course.status)}
                    </span>
                    {course.minStars > 0 && <span className="chip">⭐ {course.minStars}+ required</span>}
                  </div>
                  <p className="text-xs text-ink-dim mt-1.5">
                    {course.modules.length} modules · {lessons} lessons · {quizzes} quizzes ·{" "}
                    {starTotal} ⭐ rewards · {course._count.enrollments} enrolled
                  </p>
                </div>
                <span className="btn btn-secondary btn-sm shrink-0">Open builder</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
