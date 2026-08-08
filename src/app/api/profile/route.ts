import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json } from "@/lib/api";

const schema = z.object({
  headline: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  salesExperience: z.string().trim().max(2000).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  resumeUrl: z.string().trim().url().max(500).or(z.literal("")).optional(),
  linkedinUrl: z.string().trim().url().max(500).or(z.literal("")).optional(),
  videoIntroUrl: z.string().trim().url().max(500).or(z.literal("")).optional(),
  availability: z.string().trim().max(120).optional(),
});

export async function PATCH(req: Request) {
  return withAuth(async (user) => {
    const body = schema.parse(await req.json().catch(() => ({})));
    const profile = await db.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...body },
      update: body,
    });
    return json({ ok: true, profile });
  });
}
