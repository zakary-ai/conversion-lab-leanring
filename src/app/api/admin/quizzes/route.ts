import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";

const schema = z.object({
  moduleId: z.string(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  passingScore: z.number().int().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  return withRole("ADMIN", async (user) => {
    const body = schema.parse(await req.json());
    const defaults = {
      passingScore: Number(await getSetting("progression.defaultQuizPassingScore")),
      allowRetry: Boolean(await getSetting("training.defaultAllowQuizRetry")),
    };
    const quiz = await db.quiz.create({
      data: {
        moduleId: body.moduleId,
        title: body.title,
        description: body.description,
        passingScore: body.passingScore ?? defaults.passingScore,
        allowRetry: defaults.allowRetry,
      },
    });
    await audit({ actorId: user.id, action: "quiz.create", entityType: "quiz", entityId: quiz.id, details: { title: quiz.title } });
    return json({ quiz });
  });
}
