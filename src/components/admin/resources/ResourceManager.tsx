"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";
import { enumLabel } from "@/lib/format";

type ResourceRow = {
  id: string;
  title: string;
  description: string;
  type: string;
  url: string;
  minStars: number;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
};

const TYPES = ["PDF", "DOCUMENT", "SCRIPT", "TEMPLATE", "CHEAT_SHEET", "LINK", "VIDEO", "FILE"];

export function ResourceManager({
  resources,
  categories,
}: {
  resources: ResourceRow[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ResourceRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  async function api(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Something went wrong");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    if (!newCategory.trim()) return;
    const ok = await api("/api/admin/resource-categories", "POST", { name: newCategory.trim() });
    if (ok) setNewCategory("");
  }

  return (
    <div className="animate-rise">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resource Library</h1>
          <p className="text-ink-mid text-sm mt-1">{resources.length} resources · {categories.length} categories</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Icons.plus className="h-4 w-4" />
          New resource
        </button>
      </header>

      <div className="card p-4 mb-6 flex flex-wrap items-center gap-2">
        <span className="section-title mr-2">Categories:</span>
        {categories.map((c) => (
          <span key={c.id} className="chip">{c.name}</span>
        ))}
        <div className="flex gap-2 ml-auto">
          <input
            className="input py-1.5 w-44 text-sm"
            placeholder="New category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addCategory()}
          />
          <button className="btn btn-secondary btn-sm" onClick={() => void addCategory()} disabled={busy || !newCategory.trim()}>
            Add
          </button>
        </div>
      </div>

      {editing && (
        <ResourceForm
          initial={editing === "new" ? null : editing}
          categories={categories}
          busy={busy}
          onSubmit={async (fields) => {
            const ok =
              editing === "new"
                ? await api("/api/admin/resources", "POST", fields)
                : await api(`/api/admin/resources/${editing.id}`, "PATCH", fields);
            if (ok) setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="card divide-y divide-edge/60">
        {resources.length === 0 && (
          <p className="text-sm text-ink-mid text-center py-10">
            No resources yet. Create the first script, template, or cheat sheet.
          </p>
        )}
        {resources.map((r) => (
          <div key={r.id} className="flex items-center gap-4 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                {r.title}
                <span className={`chip ${r.status === "PUBLISHED" ? "chip-good" : "chip-accent"}`}>
                  {enumLabel(r.status)}
                </span>
                {r.minStars > 0 && <span className="chip">⭐ {r.minStars}+</span>}
              </p>
              <p className="text-xs text-ink-dim mt-0.5">
                {enumLabel(r.type)}
                {r.categoryName && ` · ${r.categoryName}`}
              </p>
            </div>
            {r.status !== "PUBLISHED" ? (
              <button className="btn btn-primary btn-sm" disabled={busy}
                onClick={() => void api(`/api/admin/resources/${r.id}`, "PATCH", { status: "PUBLISHED" })}>
                Publish
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" disabled={busy}
                onClick={() => void api(`/api/admin/resources/${r.id}`, "PATCH", { status: "DRAFT" })}>
                Unpublish
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>
              <Icons.edit className="h-3.5 w-3.5" />
            </button>
            <button
              className="btn btn-ghost btn-sm hover:text-bad"
              disabled={busy}
              onClick={() => {
                if (confirm(`Delete resource "${r.title}"?`)) {
                  void api(`/api/admin/resources/${r.id}`, "DELETE");
                }
              }}
            >
              <Icons.trash className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceForm({
  initial,
  categories,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: ResourceRow | null;
  categories: { id: string; name: string }[];
  busy: boolean;
  onSubmit: (fields: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState(initial?.type ?? "SCRIPT");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [minStars, setMinStars] = useState(initial?.minStars ?? 0);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");

  return (
    <div className="card p-5 mb-6 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{enumLabel(t)}</option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <label className="label">Min ⭐</label>
          <input className="input" type="number" min={0} value={minStars}
            onChange={(e) => setMinStars(Math.max(0, Number(e.target.value) || 0))} />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="label">File URL or link</label>
        <input className="input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div>
        <label className="label">Category</label>
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Description</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <button
          className="btn btn-primary"
          disabled={busy || !title.trim() || !url.trim()}
          onClick={() =>
            void onSubmit({
              title: title.trim(),
              description: description.trim() || undefined,
              type,
              url: url.trim(),
              minStars,
              categoryId: categoryId || null,
            })
          }
        >
          {initial ? "Save resource" : "Create resource"}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
