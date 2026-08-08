import { db } from "@/lib/db";
import { withAuth, json } from "@/lib/api";

export async function GET() {
  return withAuth(async (user) => {
    const count = await db.notification.count({ where: { userId: user.id, readAt: null } });
    return json({ count });
  });
}
