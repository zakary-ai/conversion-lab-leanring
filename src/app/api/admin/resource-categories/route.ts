import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";

export async function POST(req: Request) {
  return withRole("ADMIN", async () => {
    const body = z.object({ name: z.string().trim().min(1).max(60) }).parse(await req.json());
    const existing = await db.resourceCategory.findUnique({ where: { name: body.name } });
    if (existing) return apiError(409, "Category already exists");
    const count = await db.resourceCategory.count();
    const category = await db.resourceCategory.create({
      data: { name: body.name, sortOrder: count },
    });
    return json({ category });
  });
}
