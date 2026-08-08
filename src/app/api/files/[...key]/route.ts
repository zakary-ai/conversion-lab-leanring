import { getStorageProvider } from "@/lib/providers/storage";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api";

/** Serve files from the storage provider (local disk in development). */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Not authenticated");

  const { key } = await ctx.params;
  const storageKey = key.map(decodeURIComponent).join("/");
  const file = await getStorageProvider().get(storageKey);
  if (!file) return apiError(404, "File not found");

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
