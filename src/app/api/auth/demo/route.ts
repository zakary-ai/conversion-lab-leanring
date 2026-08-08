import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/**
 * One-click demo logins for evaluating the product in different roles and
 * star levels. Only enabled when DEMO_MODE=true — never in a real deployment.
 */
export async function POST(req: Request) {
  if (process.env.DEMO_MODE !== "true") return apiError(404, "Not found");

  const body = z
    .object({ email: z.string().email() })
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError(400, "Invalid input");

  const user = await db.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
  if (!user || user.status === "SUSPENDED") {
    // 422 (not 404) so the client can distinguish "demo data missing" from
    // "demo mode disabled" and tell the user how to fix it.
    return apiError(422, "Demo accounts not found — run `npm run db:seed` to create them.");
  }

  await createSession(user.id);
  return json({ ok: true, redirect: "/dashboard" });
}
