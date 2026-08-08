import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";

const schema = z.object({
  entity: z.enum(["course", "module", "lesson", "quiz"]),
  orderedIds: z.array(z.string()).min(1).max(500),
});

/** Persist a new ordering for a set of sibling items. */
export async function POST(req: Request) {
  return withRole("ADMIN", async () => {
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) return apiError(400, "Invalid reorder request");
    const { entity, orderedIds } = body.data;

    const updates = orderedIds.map((id, index) => {
      switch (entity) {
        case "course":
          return db.course.update({ where: { id }, data: { sortOrder: index } });
        case "module":
          return db.module.update({ where: { id }, data: { sortOrder: index } });
        case "lesson":
          return db.lesson.update({ where: { id }, data: { sortOrder: index } });
        case "quiz":
          return db.quiz.update({ where: { id }, data: { sortOrder: index } });
      }
    });
    await db.$transaction(updates);
    return json({ ok: true });
  });
}
