import { db } from "@/lib/db";
import { withAuth, json, apiError } from "@/lib/api";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(async (user) => {
    const { id } = await ctx.params;
    const application = await db.jobApplication.findUnique({ where: { id } });
    if (!application || application.userId !== user.id) {
      return apiError(404, "Application not found");
    }
    if (["HIRED", "WITHDRAWN"].includes(application.status)) {
      return apiError(400, "This application can no longer be withdrawn");
    }
    await db.jobApplication.update({ where: { id }, data: { status: "WITHDRAWN" } });
    return json({ ok: true });
  });
}
