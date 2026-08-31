import crypto from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generateAccessCode, formatAccessCode } from "@/lib/access-code";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
});

/**
 * Admin adds a person without an email: creates a LEARNER account whose only
 * credential is a generated access code (returned once here and viewable on
 * the learner's admin page). They can be given an email/role later through
 * the existing flows.
 */
export async function POST(req: Request) {
  return withRole("ADMIN", async (actor) => {
    const body = schema.parse(await req.json());
    const accessCode = generateAccessCode();

    const user = await db.user.create({
      data: {
        name: body.name,
        email: null,
        // Unusable password — the access code is the only credential
        passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")),
        role: "LEARNER",
        accessCode,
        profile: { create: {} },
      },
    });

    // Auto-enroll in courses that are open at 0 stars (same as signup)
    const openCourses = await db.course.findMany({
      where: { status: "PUBLISHED", minStars: 0 },
      select: { id: true },
    });
    if (openCourses.length > 0) {
      await db.enrollment.createMany({
        data: openCourses.map((c) => ({ userId: user.id, courseId: c.id })),
        skipDuplicates: true,
      });
    }

    await audit({
      actorId: actor.id,
      action: "user.created",
      entityType: "user",
      entityId: user.id,
      details: { name: user.name, via: "access_code" },
    });
    return json({
      user: { id: user.id, name: user.name },
      accessCode: formatAccessCode(accessCode),
    });
  });
}
