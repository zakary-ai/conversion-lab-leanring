import { db } from "./db";
import type { NotificationType } from "@prisma/client";

/**
 * In-app notification service. Email/push delivery can be layered on by
 * fanning out from here (the schema tracks emailedAt/pushedAt per row).
 */
export async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
}) {
  await db.notification.create({ data: params });
}

export async function notifyMany(
  userIds: string[],
  params: { type: NotificationType; title: string; body?: string; linkUrl?: string }
) {
  if (userIds.length === 0) return;
  await db.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...params })),
  });
}
