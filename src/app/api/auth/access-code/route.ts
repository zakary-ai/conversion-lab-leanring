import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { normalizeAccessCode } from "@/lib/access-code";

const schema = z.object({ code: z.string().trim().min(1).max(40) });

/** Sign in with an admin-issued access code (for accounts without an email). */
export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError(400, "Invalid access code");

  const code = normalizeAccessCode(body.data.code);
  const user = code.length >= 6 ? await db.user.findUnique({ where: { accessCode: code } }) : null;

  if (!user) {
    // Small uniform delay to blunt brute-force guessing; same message either way
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
    return apiError(401, "That access code isn't valid. Check for typos or ask your admin for a new one.");
  }
  if (user.status === "SUSPENDED") {
    return apiError(403, "This account has been suspended. Contact support.");
  }

  await createSession(user.id);
  const redirect = user.onboardedAt || user.role !== "LEARNER" ? "/dashboard" : "/welcome";
  return json({ ok: true, redirect });
}
