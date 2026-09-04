import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { StarIcon } from "@/components/ui/Star";

export const metadata = { title: "Admin · Stars" };

export default async function AdminStarsPage() {
  const viewer = await requireRole("ADMIN");

  const [learners, recentTx, totals] = await Promise.all([
    db.user.findMany({
      where: { role: "LEARNER" },
      orderBy: { starBalance: "desc" },
      take: 100,
      include: {
        starTransactions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { reason: true, createdAt: true, amount: true },
        },
      },
    }),
    db.starTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        user: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    db.starTransaction.groupBy({ by: ["type"], _sum: { amount: true } }),
  ]);

  const totalByType = Object.fromEntries(totals.map((t) => [t.type, t._sum.amount ?? 0]));

  return (
    <div className="animate-rise">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Star Management</h1>
        <p className="text-ink-mid text-sm mt-1">
          The transaction ledger is the source of truth — every change below is fully audited.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Automatic rewards", value: totalByType.AUTOMATIC_REWARD ?? 0 },
          { label: "Manual awards", value: totalByType.MANUAL_AWARD ?? 0 },
          { label: "Manual deductions", value: totalByType.MANUAL_DEDUCTION ?? 0 },
          { label: "Corrections", value: totalByType.ADMINISTRATIVE_CORRECTION ?? 0 },
        ].map((m) => (
          <div key={m.label} className="card p-5">
            <p className="section-title">{m.label}</p>
            <p className="text-2xl font-bold mt-1.5">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left border-b border-edge">
                <th className="px-5 py-3 section-title font-bold">Learner</th>
                <th className="px-4 py-3 section-title font-bold">Stars</th>
                <th className="px-4 py-3 section-title font-bold">Last star activity</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {learners.map((u) => (
                <tr key={u.id} className="hover:bg-overlay/40 transition-colors">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={u.name} size="sm" />
                      <span className="font-semibold">{u.name}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 font-bold text-accent-hi">
                      <StarIcon className="h-3.5 w-3.5" />
                      {u.starBalance}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-mid">
                    {u.starTransactions[0] ? (
                      <>
                        <span className={u.starTransactions[0].amount > 0 ? "text-good" : "text-bad"}>
                          {u.starTransactions[0].amount > 0 ? "+" : ""}
                          {u.starTransactions[0].amount}
                        </span>{" "}
                        {u.starTransactions[0].reason} · {timeAgo(u.starTransactions[0].createdAt, viewer.timezone)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/learners/${u.id}`} className="btn btn-secondary btn-sm">
                      History & adjust
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="card p-5 self-start">
          <p className="section-title mb-4">Latest ledger entries</p>
          <ul className="space-y-3">
            {recentTx.map((tx) => (
              <li key={tx.id} className="text-sm flex items-start gap-2.5">
                <span
                  className={`font-bold shrink-0 w-8 text-center rounded py-0.5 text-xs ${
                    tx.amount > 0 ? "text-good bg-good/10" : "text-bad bg-bad/10"
                  }`}
                >
                  {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                </span>
                <span className="min-w-0">
                  <Link href={`/admin/learners/${tx.user.id}`} className="font-semibold hover:text-accent-hi">
                    {tx.user.name}
                  </Link>
                  <span className="block text-xs text-ink-mid leading-snug">{tx.reason}</span>
                  <span className="block text-[11px] text-ink-dim mt-0.5">
                    {tx.type === "AUTOMATIC_REWARD" ? "Automatic" : `By ${tx.createdBy?.name ?? "admin"}`} ·{" "}
                    {timeAgo(tx.createdAt, viewer.timezone)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
