import { db } from "@/lib/db";
import { withAuth, json } from "@/lib/api";

export async function POST() {
  return withAuth(async (user) => {
    await db.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return json({ ok: true });
  });
}
