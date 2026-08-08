import { db } from "./db";
import { getSetting } from "./settings";
import type { User } from "@prisma/client";

/** The single nearest locked thing the learner is working toward. */
export async function getNextUnlock(user: User) {
  const balance = user.starBalance;
  const gate = { gt: balance };

  const [course, moduleRow, resource, channel, jobBoardMin] = await Promise.all([
    db.course.findFirst({
      where: { status: "PUBLISHED", minStars: gate },
      orderBy: { minStars: "asc" },
      select: { title: true, minStars: true },
    }),
    db.module.findFirst({
      where: { status: "PUBLISHED", minStars: gate, course: { status: "PUBLISHED" } },
      orderBy: { minStars: "asc" },
      select: { title: true, minStars: true },
    }),
    db.resource.findFirst({
      where: { status: "PUBLISHED", minStars: gate },
      orderBy: { minStars: "asc" },
      select: { title: true, minStars: true },
    }),
    db.channel.findFirst({
      where: { minStars: gate, minRole: null, hidden: false },
      orderBy: { minStars: "asc" },
      select: { name: true, minStars: true },
    }),
    getSetting("progression.jobBoardMinStars"),
  ]);

  const candidates: { title: string; minStars: number; kind: string }[] = [];
  if (course) candidates.push({ title: course.title, minStars: course.minStars, kind: "Course" });
  if (moduleRow) candidates.push({ title: moduleRow.title, minStars: moduleRow.minStars, kind: "Module" });
  if (resource) candidates.push({ title: resource.title, minStars: resource.minStars, kind: "Resource" });
  if (channel) candidates.push({ title: `#${channel.name}`, minStars: channel.minStars, kind: "Channel" });
  const jbMin = Number(jobBoardMin);
  if (jbMin > balance) candidates.push({ title: "Job Board", minStars: jbMin, kind: "Jobs" });

  candidates.sort((a, b) => a.minStars - b.minStars);
  return candidates[0] ?? null;
}

export async function getRecentUnlocks(userId: string) {
  return db.unlockEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 4,
  });
}

export async function getUpcomingCalls(limit = 3) {
  return db.liveCall.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      scheduledAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    include: {
      host: { select: { name: true } },
      _count: { select: { attendees: true } },
    },
  });
}

/** Recent community messages from channels the user can see. */
export async function getCommunityActivity(user: User, limit = 4) {
  return db.message.findMany({
    where: {
      deletedAt: null,
      parentId: null,
      channel: {
        hidden: false,
        isPrivate: false,
        minStars: { lte: user.starBalance },
        minRole: null,
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { name: true } },
      channel: { select: { id: true, name: true } },
    },
  });
}
