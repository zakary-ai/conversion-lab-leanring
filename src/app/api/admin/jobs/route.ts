import { db } from "@/lib/db";
import { withRole, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { getSetting } from "@/lib/settings";
import { jobSchema } from "@/lib/schemas/job";

export async function POST(req: Request) {
  return withRole("ADMIN", async (user) => {
    const body = jobSchema.parse(await req.json());
    const job = await db.job.create({ data: body });
    await audit({ actorId: user.id, action: "job.create", entityType: "job", entityId: job.id, details: { title: job.title, company: job.company } });

    if (job.status === "PUBLISHED") {
      const boardMin = Number(await getSetting("progression.jobBoardMinStars"));
      const eligible = await db.user.findMany({
        where: {
          status: "ACTIVE",
          role: "LEARNER",
          starBalance: { gte: Math.max(boardMin, job.minStars) },
        },
        select: { id: true },
      });
      await notifyMany(
        eligible.map((u) => u.id),
        {
          type: "NEW_JOB",
          title: `New opportunity: ${job.title}`,
          body: `${job.company} is hiring from the academy.`,
          linkUrl: `/jobs/${job.id}`,
        }
      );
    }
    return json({ job });
  });
}
