import { getStorageProvider } from "@/lib/providers/storage";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api";

/** Serve files from the storage provider (local disk in development). */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Not authenticated");

  const { key } = await ctx.params;
  const storageKey = key.map(decodeURIComponent).join("/");
  const storage = getStorageProvider();

  // Object storage serves bytes itself (with native Range support) via a
  // short-lived presigned URL — avoids proxying large videos through the app.
  const signedUrl = await storage.presignGet(storageKey);
  if (signedUrl) return Response.redirect(signedUrl, 307);

  const file = await storage.get(storageKey);
  if (!file) return apiError(404, "File not found");

  const baseHeaders = {
    "Content-Type": file.contentType,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  };

  // Honor Range requests so <video> can seek (local-disk provider only;
  // fine for development-sized workloads).
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const size = file.data.length;
    const start = range[1] ? parseInt(range[1], 10) : Math.max(0, size - parseInt(range[2], 10));
    const end = range[1] && range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
    if (isNaN(start) || start < 0 || start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(new Uint8Array(file.data.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new Response(new Uint8Array(file.data), {
    headers: { ...baseHeaders, "Content-Length": String(file.data.length) },
  });
}
