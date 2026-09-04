import { db } from "@/lib/db";
import { withAuth, json } from "@/lib/api";
import { canAccessChannel, starGate } from "@/lib/access";
import { isStaff } from "@/lib/auth";

/**
 * Global search. Results are filtered through the access engine so locked or
 * private content never leaks: lessons in star-gated courses and staff
 * channels are excluded for users without access.
 */
export async function GET(req: Request) {
  return withAuth(async (user) => {
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return json({ results: [] });
    const staff = isStaff(user.role);
    const contains = { contains: q, mode: "insensitive" as const };
    const publishedOnly = staff ? {} : { status: "PUBLISHED" as const };

    const [courses, lessons, channels, users] = await Promise.all([
      db.course.findMany({
        where: { title: contains, ...publishedOnly },
        take: 4,
        select: { id: true, title: true, minStars: true, status: true },
      }),
      db.lesson.findMany({
        where: {
          title: contains,
          ...publishedOnly,
          module: { ...publishedOnly, course: { ...publishedOnly } },
        },
        take: 6,
        select: {
          id: true,
          title: true,
          module: {
            select: { title: true, minStars: true, course: { select: { minStars: true } } },
          },
        },
      }),
      db.channel.findMany({
        where: { name: contains },
        take: 4,
        select: { id: true, name: true, minStars: true, minRole: true, isPrivate: true, hidden: true },
      }),
      db.user.findMany({
        where: { name: contains, status: "ACTIVE" },
        take: 4,
        select: { id: true, name: true, starBalance: true },
      }),
    ]);

    const results: { type: string; id: string; title: string; subtitle?: string; href: string; locked?: boolean }[] = [];

    for (const c of courses) {
      const gate = starGate(user, c.minStars);
      results.push({
        type: "Training",
        id: c.id,
        title: c.title,
        href: `/training/course/${c.id}`,
        locked: !gate.allowed,
      });
    }
    for (const l of lessons) {
      const needed = Math.max(l.module.minStars, l.module.course.minStars);
      const gate = starGate(user, needed);
      // Locked lessons show as locked (visible-but-locked is the product default)
      results.push({
        type: "Lessons",
        id: l.id,
        title: l.title,
        subtitle: l.module.title,
        href: `/training/lesson/${l.id}`,
        locked: !gate.allowed,
      });
    }
    for (const ch of channels) {
      const membership = await db.channelMembership.findUnique({
        where: { channelId_userId: { channelId: ch.id, userId: user.id } },
      });
      const gate = canAccessChannel(user, ch, Boolean(membership));
      if (!gate.allowed && (gate.reason === "hidden" || gate.reason === "role" || gate.reason === "membership")) {
        continue; // staff/private/hidden channels never appear for ineligible users
      }
      results.push({
        type: "Community",
        id: ch.id,
        title: `#${ch.name}`,
        href: `/community/${ch.id}`,
        locked: !gate.allowed,
      });
    }
    for (const u of users) {
      results.push({
        type: "People",
        id: u.id,
        title: u.name,
        subtitle: `${u.starBalance} ${u.starBalance === 1 ? "Star" : "Stars"}`,
        href: `/messages?to=${u.id}`,
      });
    }

    return json({ results });
  });
}
