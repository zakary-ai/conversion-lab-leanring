import { db } from "@/lib/db";
import { withAuth, json } from "@/lib/api";

export async function GET(req: Request) {
  return withAuth(async (user) => {
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    const users = await db.user.findMany({
      where: {
        status: "ACTIVE",
        id: { not: user.id },
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { lastActiveAt: { sort: "desc", nulls: "last" } },
      take: 12,
      select: {
        id: true,
        name: true,
        role: true,
        starBalance: true,
        lastActiveAt: true,
        profile: { select: { headline: true } },
      },
    });
    return json({ users });
  });
}
