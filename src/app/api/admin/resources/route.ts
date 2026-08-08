import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(["PDF", "DOCUMENT", "SCRIPT", "TEMPLATE", "CHEAT_SHEET", "LINK", "VIDEO", "FILE"]),
  categoryId: z.string().nullable().optional(),
  url: z.string().trim().url().max(1000),
  minStars: z.number().int().min(0).max(100).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export async function POST(req: Request) {
  return withRole("ADMIN", async (user) => {
    const body = schema.parse(await req.json());
    const resource = await db.resource.create({ data: body });
    await audit({ actorId: user.id, action: "resource.create", entityType: "resource", entityId: resource.id, details: { title: resource.title } });
    return json({ resource });
  });
}
