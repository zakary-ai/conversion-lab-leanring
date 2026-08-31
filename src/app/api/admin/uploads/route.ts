import { z } from "zod";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getStorageProvider } from "@/lib/providers/storage";

/**
 * Admin video uploads.
 *
 * Two modes, negotiated by the client:
 *  1. JSON body { filename, contentType, size } → when the storage provider
 *     supports presigned uploads (S3), returns { mode: "presigned", uploadUrl,
 *     key } and the browser PUTs the file straight to the bucket. Otherwise
 *     returns { mode: "form" } and the client falls back to mode 2.
 *  2. multipart/form-data with a "file" field → the file is written through
 *     the storage provider (local disk in development). Serverless platforms
 *     cap request bodies (~4.5 MB on Vercel), so production deployments need
 *     S3-compatible storage configured for mode 1.
 */

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const presignSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().regex(/^video\//, "Only video files can be uploaded"),
  size: z.number().int().min(1).max(MAX_VIDEO_BYTES, "Videos are limited to 2 GB"),
});

export async function POST(req: Request) {
  return withRole("ADMIN", async (user) => {
    const storage = getStorageProvider();

    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return apiError(400, "Missing file");
      if (!file.type.startsWith("video/")) return apiError(400, "Only video files can be uploaded");
      if (file.size > MAX_VIDEO_BYTES) return apiError(400, "Videos are limited to 2 GB");

      const data = Buffer.from(await file.arrayBuffer());
      const { key } = await storage.put({ data, filename: file.name, contentType: file.type, prefix: "videos" });
      await audit({ actorId: user.id, action: "video.upload", entityType: "file", entityId: key, details: { filename: file.name, size: file.size } });
      return json({ key });
    }

    const body = presignSchema.parse(await req.json());
    const presigned = await storage.presignPut({ filename: body.filename, contentType: body.contentType, prefix: "videos" });
    if (!presigned) return json({ mode: "form" });

    await audit({ actorId: user.id, action: "video.upload", entityType: "file", entityId: presigned.key, details: { filename: body.filename, size: body.size } });
    return json({ mode: "presigned", uploadUrl: presigned.url, key: presigned.key });
  });
}
