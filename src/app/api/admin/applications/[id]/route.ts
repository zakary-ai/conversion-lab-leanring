import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { enumLabel } from "@/lib/format";

const schema = z.object({
  status: z.enum(["APPLIED", "UNDER_REVIEW", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const application = await db.jobApplication.findUnique({
      where: { id },
      include: { job: { select: { title: true, company: true } } },
    });
    if (!application) return apiError(404, "Application not found");

    await db.jobApplication.update({ where: { id }, data: { status: body.status } });
    await audit({
      actorId: user.id,
      action: "job.application_status_changed",
      entityType: "job_application",
      entityId: id,
      details: { from: application.status, to: body.status, job: application.job.title },
    });
    await notify({
      userId: application.userId,
      type: "APPLICATION_UPDATE",
      title: `Application update: ${application.job.title}`,
      body: `${application.job.company} moved your application to ${enumLabel(body.status)}.`,
      linkUrl: "/jobs/applications",
    });
    return json({ ok: true });
  });
}
