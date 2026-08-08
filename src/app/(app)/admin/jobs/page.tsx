import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { JobManager } from "@/components/admin/jobs/JobManager";

export const metadata = { title: "Admin · Jobs" };

export default async function AdminJobsPage() {
  await requireRole("ADMIN");
  const jobs = await db.job.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      applications: {
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              starBalance: true,
              profile: { select: { headline: true, resumeUrl: true, linkedinUrl: true } },
            },
          },
        },
      },
    },
  });

  return (
    <JobManager
      jobs={jobs.map((j) => ({
        id: j.id,
        company: j.company,
        title: j.title,
        location: j.location ?? "",
        locationType: j.locationType,
        employmentType: j.employmentType,
        category: j.category,
        compensation: j.compensation ?? "",
        baseSalary: j.baseSalary ?? "",
        commission: j.commission ?? "",
        description: j.description,
        requirements: j.requirements ?? "",
        minStars: j.minStars,
        status: j.status,
        applications: j.applications.map((a) => ({
          id: a.id,
          status: a.status,
          message: a.message,
          resumeUrl: a.resumeUrl ?? a.user.profile?.resumeUrl ?? null,
          createdAt: a.createdAt.toISOString(),
          applicant: {
            id: a.user.id,
            name: a.user.name,
            email: a.user.email,
            stars: a.user.starBalance,
            headline: a.user.profile?.headline ?? null,
            linkedinUrl: a.user.profile?.linkedinUrl ?? null,
          },
        })),
      }))}
    />
  );
}
