import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  courseId: z.string(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  minStars: z.number().int().min(0).max(100).optional(),
  starReward: z.number().int().min(0).max(10).optional(),
  prerequisiteId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  return withRole("ADMIN", async (user) => {
    const body = schema.parse(await req.json());
    const count = await db.module.count({ where: { courseId: body.courseId } });
    const moduleRow = await db.module.create({ data: { ...body, sortOrder: count } });
    await audit({ actorId: user.id, action: "module.create", entityType: "module", entityId: moduleRow.id, details: { title: moduleRow.title } });
    return json({ module: moduleRow });
  });
}
