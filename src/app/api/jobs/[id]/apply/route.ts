import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";
import { canAccessJob, canAccessJobBoard } from "@/lib/access";
import { audit } from "@/lib/audit";

const schema = z.object({
  message: z.string().trim().max(2000).optional(),
  resumeUrl: z.string().trim().url().max(500).or(z.literal("")).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const body = schema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return apiError(400, "Invalid application");

    const job = await db.job.findUnique({ where: { id } });
    if (!job) return apiError(404, "Job not found");

    // Backend enforcement of both the job-board gate and per-job star gate
    const boardAccess = await canAccessJobBoard(user);
    if (!boardAccess.allowed) return apiError(403, "The Job Board is not unlocked yet");
    const jobAccess = canAccessJob(user, job);
    if (!jobAccess.allowed) return apiError(403, "This position requires more Stars");

    const existing = await db.jobApplication.findUnique({
      where: { jobId_userId: { jobId: id, userId: user.id } },
    });
    if (existing && existing.status !== "WITHDRAWN") {
      return apiError(409, "You've already applied to this position");
    }

    const profile = await db.profile.findUnique({ where: { userId: user.id } });
    const application = existing
      ? await db.jobApplication.update({
          where: { id: existing.id },
          data: {
            status: "APPLIED",
            message: body.data.message ?? null,
            resumeUrl: body.data.resumeUrl || profile?.resumeUrl || null,
          },
        })
      : await db.jobApplication.create({
          data: {
            jobId: id,
            userId: user.id,
            message: body.data.message ?? null,
            resumeUrl: body.data.resumeUrl || profile?.resumeUrl || null,
          },
        });

    await audit({
      actorId: user.id,
      action: "job.application_submitted",
      entityType: "job_application",
      entityId: application.id,
      details: { jobId: id, jobTitle: job.title },
    });
    return json({ ok: true, applicationId: application.id });
  });
}
