import { db } from "./db";

/**
 * Build the payload for the "Star earned" celebration: what was just
 * unlocked, read from UnlockEvents written by the star ledger moments ago.
 */
export async function buildAwardPayload(
  userId: string,
  award: { moduleTitle?: string; stars: number; newBalance: number },
  reason?: string
) {
  const unlocks = await db.unlockEvent.findMany({
    where: { userId, createdAt: { gte: new Date(Date.now() - 15_000) } },
    orderBy: { atStars: "asc" },
    select: { title: true, entityType: true },
  });
  return {
    stars: award.stars,
    newBalance: award.newBalance,
    reason: reason ?? (award.moduleTitle ? `You've completed ${award.moduleTitle}.` : "Milestone reached"),
    unlocks,
  };
}
