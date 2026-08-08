import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { enumLabel, timeAgo } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { StarIcon } from "@/components/ui/Star";
import { Icons } from "@/components/ui/icons";

export const metadata = { title: "Admin · Learners" };

export default async function AdminLearnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole("ADMIN");
  const { q } = await searchParams;

  const users = await db.user.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : {},
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      _count: { select: { lessonProgress: { where: { completedAt: { not: null } } }, quizAttempts: true } },
    },
  });
  const publishedLessons = await db.lesson.count({ where: { status: "PUBLISHED" } });

  return (
    <div className="animate-rise">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Learners</h1>
        <p className="text-ink-mid text-sm mt-1">{users.length} accounts shown</p>
      </header>

      <form action="/admin/learners" className="mb-5 max-w-md">
        <div className="relative">
          <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-dim" />
          <input name="q" defaultValue={q ?? ""} placeholder="Search by name or email…" className="input pl-9" />
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left border-b border-edge">
              <th className="px-5 py-3 section-title font-bold">Learner</th>
              <th className="px-4 py-3 section-title font-bold">Role</th>
              <th className="px-4 py-3 section-title font-bold">Stars</th>
              <th className="px-4 py-3 section-title font-bold">Progress</th>
              <th className="px-4 py-3 section-title font-bold">Last active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/60">
            {users.map((u) => {
              const progress =
                publishedLessons === 0
                  ? 0
                  : Math.round((u._count.lessonProgress / publishedLessons) * 100);
              return (
                <tr key={u.id} className="hover:bg-overlay/40 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/learners/${u.id}`} className="flex items-center gap-3">
                      <Avatar name={u.name} size="sm" />
                      <span>
                        <span className="block font-semibold">{u.name}</span>
                        <span className="block text-xs text-ink-dim">{u.email}</span>
                      </span>
                      {u.status === "SUSPENDED" && <span className="chip chip-bad">Suspended</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-mid">{enumLabel(u.role)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 font-semibold text-accent-hi">
                      <StarIcon className="h-3.5 w-3.5" />
                      {u.starBalance}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-mid">{u.role === "LEARNER" ? `${progress}%` : "—"}</td>
                  <td className="px-4 py-3 text-ink-dim text-xs">
                    {u.lastActiveAt ? timeAgo(u.lastActiveAt) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/learners/${u.id}`} className="btn btn-secondary btn-sm">
                      Manage
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="text-sm text-ink-mid text-center py-10">No users match “{q}”.</p>
        )}
      </div>
    </div>
  );
}
