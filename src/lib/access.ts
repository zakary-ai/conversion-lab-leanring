import { db } from "./db";
import { getSetting } from "./settings";
import { isStaff, roleAtLeast } from "./auth";
import type { User, Channel, Role } from "@prisma/client";

/**
 * Central content-access engine.
 *
 * Every gate in the product — pages, API routes, search, navigation — asks
 * this module instead of re-implementing conditions. Staff (moderator+) can
 * always see content; learners are gated by stars, prerequisites, role
 * restrictions and channel membership. The backend enforces the same rules
 * the UI renders, so URLs can't be used to bypass locks.
 */

export type AccessResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "stars" | "role" | "prerequisite" | "membership" | "hidden" | "unpublished";
      required?: number; // stars required
      current?: number; // user's stars
      prerequisiteTitle?: string;
    };

export function starGate(user: User, minStars: number): AccessResult {
  if (isStaff(user.role)) return { allowed: true };
  if (user.starBalance >= minStars) return { allowed: true };
  return { allowed: false, reason: "stars", required: minStars, current: user.starBalance };
}

export function canAccessCourse(user: User, course: { status: string; minStars: number }): AccessResult {
  if (course.status !== "PUBLISHED" && !isStaff(user.role)) {
    return { allowed: false, reason: "unpublished" };
  }
  return starGate(user, course.minStars);
}

export async function canAccessModule(
  user: User,
  module: {
    id: string;
    status: string;
    minStars: number;
    prerequisiteId: string | null;
    course?: { status: string; minStars: number };
  }
): Promise<AccessResult> {
  if (module.status !== "PUBLISHED" && !isStaff(user.role)) {
    return { allowed: false, reason: "unpublished" };
  }
  if (module.course) {
    const courseGate = canAccessCourse(user, module.course);
    if (!courseGate.allowed) return courseGate;
  }
  const stars = starGate(user, module.minStars);
  if (!stars.allowed) return stars;

  if (module.prerequisiteId && !isStaff(user.role)) {
    const done = await isModuleCompleted(user.id, module.prerequisiteId);
    if (!done) {
      const prereq = await db.module.findUnique({
        where: { id: module.prerequisiteId },
        select: { title: true },
      });
      return {
        allowed: false,
        reason: "prerequisite",
        prerequisiteTitle: prereq?.title ?? "a previous module",
      };
    }
  }
  return { allowed: true };
}

export function canAccessChannel(
  user: User,
  channel: Pick<Channel, "minStars" | "minRole" | "isPrivate" | "hidden">,
  isMember?: boolean
): AccessResult {
  // Moderators+ can access every channel (community oversight)
  if (isStaff(user.role)) return { allowed: true };
  if (channel.minRole && !roleAtLeast(user.role, channel.minRole as Role)) {
    return { allowed: false, reason: channel.hidden ? "hidden" : "role" };
  }
  if (channel.isPrivate && !isMember) {
    return { allowed: false, reason: "membership" };
  }
  const stars = starGate(user, channel.minStars);
  if (!stars.allowed && channel.hidden) return { allowed: false, reason: "hidden" };
  return stars;
}

export function canPostInChannel(
  user: User,
  channel: Pick<Channel, "minStars" | "minRole" | "isPrivate" | "hidden" | "readOnly">,
  isMember?: boolean
): AccessResult {
  const access = canAccessChannel(user, channel, isMember);
  if (!access.allowed) return access;
  if (channel.readOnly && !isStaff(user.role)) {
    return { allowed: false, reason: "role" };
  }
  return { allowed: true };
}

export function canAccessCall(user: User, call: { minStars: number }): AccessResult {
  return starGate(user, call.minStars);
}

/** Learners can book 1-on-1s once they reach the admin-configured star threshold (0 = everyone). */
export async function canBookOneOnOne(user: User): Promise<AccessResult> {
  const min = Number(await getSetting("booking.minStars"));
  return starGate(user, min);
}

/**
 * A module is complete when every required published lesson is completed and
 * every published quiz has a passing attempt.
 */
export async function isModuleCompleted(userId: string, moduleId: string): Promise<boolean> {
  const [requiredLessons, completed, quizzes] = await Promise.all([
    db.lesson.findMany({
      where: { moduleId, required: true, status: "PUBLISHED" },
      select: { id: true },
    }),
    db.lessonProgress.findMany({
      where: {
        userId,
        completedAt: { not: null },
        lesson: { moduleId, required: true, status: "PUBLISHED" },
      },
      select: { lessonId: true },
    }),
    db.quiz.findMany({
      where: { moduleId, status: "PUBLISHED" },
      select: { id: true, attempts: { where: { userId, passed: true }, take: 1 } },
    }),
  ]);
  if (requiredLessons.length === 0 && quizzes.length === 0) return false;
  const completedIds = new Set(completed.map((p) => p.lessonId));
  const lessonsDone = requiredLessons.every((l) => completedIds.has(l.id));
  const quizzesDone = quizzes.every((q) => q.attempts.length > 0);
  return lessonsDone && quizzesDone;
}
