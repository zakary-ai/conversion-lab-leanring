import { db } from "@/lib/db";
import { withAuth, json } from "@/lib/api";

export async function GET() {
  return withAuth(async (user) => {
    const notifications = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return json({ notifications });
  });
}
