import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { CourseBuilder } from "@/components/admin/training/CourseBuilder";

export const metadata = { title: "Admin · Course Builder" };

export default async function AdminCoursePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;
  const course = await db.course.findUnique({
    where: { id },
    include: {
      modules: {
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: { orderBy: { sortOrder: "asc" }, include: { videoAsset: true } },
          quizzes: {
            orderBy: { sortOrder: "asc" },
            include: { _count: { select: { questions: true, attempts: true } } },
          },
          prerequisite: { select: { id: true, title: true } },
        },
      },
    },
  });
  if (!course) notFound();

  return (
    <CourseBuilder
      course={{
        id: course.id,
        title: course.title,
        description: course.description ?? "",
        minStars: course.minStars,
        status: course.status,
        modules: course.modules.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description ?? "",
          minStars: m.minStars,
          starReward: m.starReward,
          status: m.status,
          prerequisiteId: m.prerequisiteId,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            description: l.description ?? "",
            type: l.type,
            status: l.status,
            durationMin: l.durationMin,
            videoProvider: l.videoAsset?.provider ?? "",
            // Storage keys of uploaded files are internal — never shown as a URL
            videoUrl: l.videoAsset && l.videoAsset.provider !== "file" ? l.videoAsset.reference : "",
            content: l.content ?? "",
            linkUrl: l.linkUrl ?? "",
            fileUrl: l.fileUrl ?? "",
          })),
          quizzes: m.quizzes.map((q) => ({
            id: q.id,
            title: q.title,
            status: q.status,
            passingScore: q.passingScore,
            questionCount: q._count.questions,
            attemptCount: q._count.attempts,
          })),
        })),
      }}
    />
  );
}
