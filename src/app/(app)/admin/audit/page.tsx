import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateShort, formatTime } from "@/lib/format";

export const metadata = { title: "Admin · Audit Log" };

export default async function AdminAuditPage() {
  const viewer = await requireRole("ADMIN");
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true, role: true } } },
  });

  return (
    <div className="animate-rise">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-ink-mid text-sm mt-1">
          Every administrative action, permanently recorded. Showing the latest {logs.length}.
        </p>
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left border-b border-edge">
              <th className="px-5 py-3 section-title font-bold">Action</th>
              <th className="px-4 py-3 section-title font-bold">Actor</th>
              <th className="px-4 py-3 section-title font-bold">Target</th>
              <th className="px-4 py-3 section-title font-bold">Details</th>
              <th className="px-4 py-3 section-title font-bold">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/60">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-overlay/40 transition-colors align-top">
                <td className="px-5 py-3">
                  <code className="text-xs text-accent-hi bg-accent/10 rounded px-1.5 py-0.5">
                    {log.action}
                  </code>
                </td>
                <td className="px-4 py-3 text-ink-mid whitespace-nowrap">{log.actor?.name ?? "System"}</td>
                <td className="px-4 py-3 text-xs text-ink-dim whitespace-nowrap">
                  {log.entityType ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-ink-mid max-w-md">
                  {log.details ? (
                    <span className="break-all">
                      {Object.entries(log.details as Record<string, unknown>)
                        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                        .join(" · ")}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-ink-dim whitespace-nowrap">
                  {formatDateShort(log.createdAt, viewer.timezone)} {formatTime(log.createdAt, viewer.timezone)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && (
          <p className="text-sm text-ink-mid text-center py-10">No audit entries yet.</p>
        )}
      </div>
    </div>
  );
}
