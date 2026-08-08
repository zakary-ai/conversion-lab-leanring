import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  minStars: z.number().int().min(0).max(100).optional(),
});

export async function POST(req: Request) {
  return withRole("ADMIN", async (user) => {
    const body = schema.parse(await req.json());
    const count = await db.course.count();
    const course = await db.course.create({
      data: { ...body, sortOrder: count },
    });
    await audit({ actorId: user.id, action: "course.create", entityType: "course", entityId: course.id, details: { title: course.title } });
    return json({ course });
  });
}
