import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Admin · Overview" };

export default async function AdminOverviewPage() {
  const viewer = await requireRole("MODERATOR");
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalLearners,
    activeThisWeek,
    lessonTotals,
    quizAttempts,
    quizPasses,
    starsAwarded,
    callAttendance,
    upcomingBookings,
    messagesThisWeek,
    recentAudit,
    bookingsThisWeek,
  ] = await Promise.all([
    db.user.count({ where: { role: "LEARNER" } }),
    db.user.count({ where: { role: "LEARNER", lastActiveAt: { gte: weekAgo } } }),
    Promise.all([
      db.lessonProgress.count({ where: { completedAt: { not: null } } }),
      db.lesson.count({ where: { status: "PUBLISHED" } }),
      db.user.count({ where: { role: "LEARNER" } }),
    ]),
    db.quizAttempt.count(),
    db.quizAttempt.count({ where: { passed: true } }),
    db.starTransaction.aggregate({ _sum: { amount: true }, where: { amount: { gt: 0 } } }),
    db.callAttendee.count({ where: { joinedAt: { not: null } } }),
    db.booking.count({ where: { status: "CONFIRMED", startsAt: { gte: new Date() } } }),
    db.message.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { name: true } } },
    }),
    db.booking.count({
      where: { status: "CONFIRMED", startsAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const [completedLessons, publishedLessons, learnerCount] = lessonTotals;
  const avgCompletion =
    publishedLessons === 0 || learnerCount === 0
      ? 0
      : Math.round((completedLessons / (publishedLessons * learnerCount)) * 100);
  const passRate = quizAttempts === 0 ? 0 : Math.round((quizPasses / quizAttempts) * 100);

  // Signups per week for the last 8 weeks (simple inline trend)
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
  const recentUsers = await db.user.findMany({
    where: { createdAt: { gte: eightWeeksAgo }, role: "LEARNER" },
    select: { createdAt: true },
  });
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(Date.now() - (8 - i) * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() - (7 - i) * 7 * 24 * 60 * 60 * 1000);
    return recentUsers.filter((u) => u.createdAt >= start && u.createdAt < end).length;
  });
  const maxWeek = Math.max(...weeks, 1);

  const metrics = [
    { label: "Total learners", value: totalLearners, href: "/admin/learners" },
    { label: "Active this week", value: activeThisWeek, href: "/admin/learners" },
    { label: "Avg completion", value: `${avgCompletion}%`, href: "/admin/training" },
    { label: "Quiz pass rate", value: `${passRate}%`, href: "/admin/training" },
    { label: "Stars awarded", value: starsAwarded._sum.amount ?? 0, href: "/admin/stars" },
    { label: "Call attendance", value: callAttendance, href: "/admin/calls" },
    { label: "1-on-1s booked", value: upcomingBookings, href: "/admin/one-on-ones" },
    { label: "Messages this week", value: messagesThisWeek, href: "/community" },
  ];

  return (
    <div className="animate-rise">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
          <p className="text-ink-mid text-sm mt-1">Everything happening across the academy.</p>
        </div>
        {bookingsThisWeek > 0 && (
          <Link href="/admin/one-on-ones" className="chip chip-accent">
            {bookingsThisWeek} 1-on-1{bookingsThisWeek === 1 ? "" : "s"} in the next 7 days
          </Link>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href} className="card card-hover p-5">
            <p className="section-title">{m.label}</p>
            <p className="text-3xl font-bold tracking-tight mt-2">{m.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <section className="card p-6">
          <p className="section-title mb-5">New learners · last 8 weeks</p>
          <div className="flex items-end gap-2 h-36">
            {weeks.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs text-ink-dim">{count}</span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-accent-deep to-accent transition-all"
                  style={{ height: `${Math.max(4, (count / maxWeek) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-ink-dim mt-2">
            <span>8w ago</span>
            <span>now</span>
          </div>
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="section-title">Recent admin activity</p>
            <Link href="/admin/audit" className="text-xs text-accent-hi hover:underline">
              Full audit log →
            </Link>
          </div>
          {recentAudit.length === 0 ? (
            <p className="text-sm text-ink-mid">No administrative activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentAudit.map((log) => (
                <li key={log.id} className="flex items-baseline gap-3 text-sm">
                  <code className="text-xs text-accent-hi bg-accent/10 rounded px-1.5 py-0.5 shrink-0">
                    {log.action}
                  </code>
                  <span className="text-ink-mid truncate">{log.actor?.name ?? "System"}</span>
                  <span className="text-xs text-ink-dim ml-auto shrink-0">{timeAgo(log.createdAt, viewer.timezone)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
