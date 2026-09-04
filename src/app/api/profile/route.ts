import { z } from "zod";
import { db } from "@/lib/db";
import { withAuth, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { isValidTimeZone } from "@/lib/timezone";
import { setAccountTimeZone } from "@/lib/user-timezone";

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
  // Account-level, not a Profile column: saved on the user and synced everywhere
  timezone: z.string().trim().refine(isValidTimeZone, "Unknown time zone").optional(),
});

export async function PATCH(req: Request) {
  return withAuth(async (user) => {
    const { timezone, ...fields } = schema.parse(await req.json().catch(() => ({})));
    const profile = await db.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...fields },
      update: fields,
    });

    const zoneChanged = Boolean(timezone) && timezone !== user.timezone;
    if (timezone && zoneChanged) {
      await setAccountTimeZone(user.id, timezone);
      await audit({
        actorId: user.id,
        action: "user.timezone_changed",
        entityType: "user",
        entityId: user.id,
        details: { from: user.timezone, to: timezone },
      });
    }
    return json({ ok: true, profile, timezone: zoneChanged ? timezone : user.timezone });
  });
}
