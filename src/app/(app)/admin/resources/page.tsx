import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { ResourceManager } from "@/components/admin/resources/ResourceManager";

export const metadata = { title: "Admin · Resources" };

export default async function AdminResourcesPage() {
  await requireRole("ADMIN");
  const [resources, categories] = await Promise.all([
    db.resource.findMany({ orderBy: { createdAt: "desc" }, include: { category: true } }),
    db.resourceCategory.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <ResourceManager
      resources={resources.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description ?? "",
        type: r.type,
        url: r.url,
        minStars: r.minStars,
        status: r.status,
        categoryId: r.categoryId,
        categoryName: r.category?.name ?? null,
      }))}
      categories={categories}
    />
  );
}
