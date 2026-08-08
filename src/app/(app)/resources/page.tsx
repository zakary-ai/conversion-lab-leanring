import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessResource } from "@/lib/access";
import { LockChip } from "@/components/ui/Locked";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icons } from "@/components/ui/icons";
import { enumLabel } from "@/lib/format";

export const metadata = { title: "Resources" };

const TYPE_ICONS: Record<string, string> = {
  PDF: "📄",
  DOCUMENT: "📃",
  SCRIPT: "📞",
  TEMPLATE: "🧩",
  CHEAT_SHEET: "⚡",
  LINK: "🔗",
  VIDEO: "🎬",
  FILE: "📁",
};

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;
  const user = await requireUser();

  const [categories, resources] = await Promise.all([
    db.resourceCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    db.resource.findMany({
      where: {
        status: "PUBLISHED",
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
        ...(category ? { category: { name: category } } : {}),
      },
      orderBy: [{ minStars: "asc" }, { createdAt: "desc" }],
      include: { category: true },
    }),
  ]);

  const withAccess = resources.map((r) => ({ resource: r, access: canAccessResource(user, r) }));

  return (
    <div className="animate-rise">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Resource Library</h1>
        <p className="text-ink-mid text-sm mt-1">
          Scripts, frameworks, and templates from the field. New resources unlock as you earn Stars.
        </p>
      </header>

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form className="flex-1" action="/resources">
          {category && <input type="hidden" name="category" value={category} />}
          <div className="relative">
            <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-dim" />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search resources…"
              className="input pl-9"
            />
          </div>
        </form>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link
            href={q ? `/resources?q=${encodeURIComponent(q)}` : "/resources"}
            className={`chip whitespace-nowrap ${!category ? "chip-accent" : ""}`}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/resources?category=${encodeURIComponent(c.name)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`chip whitespace-nowrap ${category === c.name ? "chip-accent" : ""}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      {withAccess.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icons.resources className="h-6 w-6" />}
            title={q || category ? "No matching resources" : "No resources yet"}
            message={
              q || category
                ? "Try a different search or category."
                : "The resource library is being stocked. Check back soon."
            }
            actionLabel={q || category ? "Clear filters" : undefined}
            actionHref={q || category ? "/resources" : undefined}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {withAccess.map(({ resource, access }) => {
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-overlay border border-edge text-xl">
                    {TYPE_ICONS[resource.type] ?? "📄"}
                  </span>
                  {access.allowed ? (
                    resource.category && <span className="chip">{resource.category.name}</span>
                  ) : (
                    <LockChip required={access.required ?? 0} />
                  )}
                </div>
                <h2 className="font-bold mt-4 leading-snug">{resource.title}</h2>
                {resource.description && (
                  <p className="text-sm text-ink-mid mt-1.5 line-clamp-2">{resource.description}</p>
                )}
                <p className="text-xs text-ink-dim mt-3">{enumLabel(resource.type)}</p>
              </>
            );

            return access.allowed ? (
              <a
                key={resource.id}
                href={resource.url}
                target="_blank"
                rel="noreferrer"
                className="card card-hover p-5 block"
              >
                {body}
              </a>
            ) : (
              <div key={resource.id} className="card p-5 opacity-70">
                {body}
                <p className="text-xs text-ink-mid mt-2">
                  Earn {(access.required ?? 0) - user.starBalance} more{" "}
                  {(access.required ?? 0) - user.starBalance === 1 ? "Star" : "Stars"} to unlock.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
