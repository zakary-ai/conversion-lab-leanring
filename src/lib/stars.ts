import { db } from "./db";
import { notify } from "./notifications";
import { audit } from "./audit";
import type { StarTxType } from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * Star ledger service.
 *
 * The StarTransaction table is the source of truth; User.starBalance is a
 * cached aggregate maintained inside the same DB transaction. Automatic
 * rewards are made idempotent by the unique constraint on
 * (userId, sourceType, sourceId, type) — a milestone can never pay twice.
 */

export class DuplicateRewardError extends Error {}

export async function grantStars(params: {
  userId: string;
  amount: number; // positive to award, negative to deduct
  type: StarTxType;
  reason: string;
  sourceType?: string;
  sourceId?: string;
  createdById?: string;
}): Promise<{ previousBalance: number; newBalance: number }> {
  const { userId, amount, type, reason, sourceType, sourceId, createdById } = params;
  if (amount === 0) throw new Error("Star adjustment amount cannot be zero");

  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { starBalance: true },
      });
      const previousBalance = user.starBalance;
      const newBalance = Math.max(0, previousBalance + amount);

      await tx.starTransaction.create({
        data: {
          userId,
          amount,
          type,
          sourceType: sourceType ?? null,
          sourceId: sourceId ?? null,
          reason,
          previousBalance,
          newBalance,
          createdById: createdById ?? null,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { starBalance: newBalance },
      });
      return { previousBalance, newBalance };
    });

    await afterBalanceChange(userId, result.previousBalance, result.newBalance, reason);
    return result;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" // unique violation → milestone already rewarded
    ) {
      throw new DuplicateRewardError(
        `Automatic reward for ${sourceType}:${sourceId} already granted to user ${userId}`
      );
    }
    throw err;
  }
}

/** Award an automatic milestone star; returns null if it was already granted. */
export async function grantAutomaticReward(params: {
  userId: string;
  amount: number;
  reason: string;
  sourceType: string;
  sourceId: string;
}) {
  try {
    return await grantStars({ ...params, type: "AUTOMATIC_REWARD" });
  } catch (err) {
    if (err instanceof DuplicateRewardError) return null;
    throw err;
  }
}

/** Manual admin adjustment with mandatory reason; writes audit trail. */
export async function adjustStarsManually(params: {
  userId: string;
  amount: number;
  reason: string;
  actorId: string;
}) {
  const type: StarTxType = params.amount >= 0 ? "MANUAL_AWARD" : "MANUAL_DEDUCTION";
  const result = await grantStars({
    userId: params.userId,
    amount: params.amount,
    type,
    reason: params.reason,
    createdById: params.actorId,
  });
  await audit({
    actorId: params.actorId,
    action: params.amount >= 0 ? "star.award" : "star.deduct",
    entityType: "user",
    entityId: params.userId,
    details: { amount: params.amount, reason: params.reason, ...result },
  });
  return result;
}

/**
 * After any balance change: notify the user and record which content just
 * became eligible so the dashboard can surface "Recently unlocked".
 */
async function afterBalanceChange(
  userId: string,
  previous: number,
  current: number,
  reason: string
) {
  if (current > previous) {
    await notify({
      userId,
      type: "STAR_EARNED",
      title: `Star earned — you now have ${current} ${current === 1 ? "Star" : "Stars"}`,
      body: reason,
      linkUrl: "/dashboard",
    });
    await recordUnlocks(userId, previous, current);
  }
}

async function recordUnlocks(userId: string, previous: number, current: number) {
  const starRange = { gt: previous, lte: current };

  const [courses, modules, channels, recordings] = await Promise.all([
    db.course.findMany({ where: { status: "PUBLISHED", minStars: starRange }, select: { id: true, title: true, minStars: true } }),
    db.module.findMany({ where: { status: "PUBLISHED", minStars: starRange }, select: { id: true, title: true, minStars: true } }),
    db.channel.findMany({ where: { minStars: starRange, minRole: null }, select: { id: true, name: true, minStars: true } }),
    db.callRecording.findMany({ where: { status: "PUBLISHED", minStars: starRange }, select: { id: true, title: true, minStars: true } }),
  ]);

  const events: { entityType: string; entityId: string | null; title: string; atStars: number }[] = [
    ...courses.map((c) => ({ entityType: "course", entityId: c.id, title: c.title, atStars: c.minStars })),
    ...modules.map((m) => ({ entityType: "module", entityId: m.id, title: m.title, atStars: m.minStars })),
    ...channels.map((ch) => ({ entityType: "channel", entityId: ch.id, title: `#${ch.name}`, atStars: ch.minStars })),
    ...recordings.map((r) => ({ entityType: "recording", entityId: r.id, title: r.title, atStars: r.minStars })),
  ];

  if (events.length > 0) {
    await db.unlockEvent.createMany({
      data: events.map((e) => ({ userId, ...e })),
    });
    const named = events.slice(0, 3).map((e) => e.title).join(", ");
    await notify({
      userId,
      type: "CONTENT_UNLOCKED",
      title: `New content unlocked${events.length > 1 ? ` (${events.length})` : ""}`,
      body: named + (events.length > 3 ? ` and ${events.length - 3} more` : ""),
      linkUrl: "/dashboard",
    });
  }
}

export async function getStarHistory(userId: string) {
  return db.starTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
}
