import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { detectProviderFromUrl } from "@/lib/providers/video";
import { getStorageProvider } from "@/lib/providers/storage";

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  type: z.enum(["VIDEO", "TEXT", "DOCUMENT", "LINK"]).optional(),
  videoUrl: z.string().trim().url().nullable().optional(),
  // Storage key of a video uploaded via /api/admin/uploads; wins over videoUrl
  videoKey: z.string().trim().regex(/^videos\/[\w.\-]+$/).optional(),
  content: z.string().trim().max(20000).nullable().optional(),
  fileUrl: z.string().trim().url().nullable().optional(),
  linkUrl: z.string().trim().url().nullable().optional(),
  durationMin: z.number().int().min(0).max(600).nullable().optional(),
  required: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const body = schema.parse(await req.json());
    const { videoUrl, videoKey, ...rest } = body;

    const existing = await db.lesson.findUnique({ where: { id }, include: { videoAsset: true } });
    if (!existing) return apiError(404, "Lesson not found");

    let videoAssetId = existing.videoAssetId;
    let replacedFileKey: string | null = null;
    if (videoKey !== undefined || videoUrl !== undefined) {
      const detected = videoKey
        ? { provider: "file", reference: videoKey }
        : videoUrl
          ? detectProviderFromUrl(videoUrl)
          : null;
      const oldAsset = existing.videoAsset;
      if (oldAsset?.provider === "file" && oldAsset.reference !== detected?.reference) {
        replacedFileKey = oldAsset.reference;
      }
      if (!detected) {
        videoAssetId = null;
      } else if (oldAsset) {
        // Replace video in place — keeps the same asset id
        await db.videoAsset.update({ where: { id: oldAsset.id }, data: detected });
      } else {
        const asset = await db.videoAsset.create({
          data: { title: body.title ?? existing.title, ...detected },
        });
        videoAssetId = asset.id;
      }
    }

    const lesson = await db.lesson.update({ where: { id }, data: { ...rest, videoAssetId } });

    // Best-effort cleanup of a replaced/removed uploaded file, unless the
    // asset is still referenced by another lesson
    if (replacedFileKey && existing.videoAsset) {
      const stillShared = await db.lesson.count({
        where: { videoAssetId: existing.videoAsset.id, id: { not: id } },
      });
      if (stillShared === 0) {
        await getStorageProvider().delete(replacedFileKey).catch(() => {});
        if (videoAssetId === null) {
          await db.videoAsset.delete({ where: { id: existing.videoAsset.id } }).catch(() => {});
        }
      }
    }

    if (body.status) {
      await audit({
        actorId: user.id,
        action: `lesson.${body.status.toLowerCase()}`,
        entityType: "lesson",
        entityId: id,
        details: { title: lesson.title },
      });
    }
    return json({ lesson });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withRole("ADMIN", async (user) => {
    const { id } = await ctx.params;
    const lesson = await db.lesson.findUnique({ where: { id }, include: { videoAsset: true } });
    if (!lesson) return apiError(404, "Lesson not found");
    await db.lesson.delete({ where: { id } });

    // Clean up an uploaded video file once nothing references it
    if (lesson.videoAsset?.provider === "file") {
      const stillShared = await db.lesson.count({ where: { videoAssetId: lesson.videoAsset.id } });
      if (stillShared === 0) {
        await getStorageProvider().delete(lesson.videoAsset.reference).catch(() => {});
        await db.videoAsset.delete({ where: { id: lesson.videoAsset.id } }).catch(() => {});
      }
    }

    await audit({ actorId: user.id, action: "lesson.delete", entityType: "lesson", entityId: id, details: { title: lesson.title } });
    return json({ ok: true });
  });
}
