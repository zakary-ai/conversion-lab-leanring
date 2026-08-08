import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { detectProviderFromUrl } from "@/lib/providers/video";

const schema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  type: z.enum(["VIDEO", "TEXT", "DOCUMENT", "LINK"]).optional(),
  videoUrl: z.string().trim().url().nullable().optional(),
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
    const { videoUrl, ...rest } = body;

    const existing = await db.lesson.findUnique({ where: { id }, include: { videoAsset: true } });
    if (!existing) return apiError(404, "Lesson not found");

    let videoAssetId = existing.videoAssetId;
    if (videoUrl !== undefined) {
      if (videoUrl === null) {
        videoAssetId = null;
      } else {
        const detected = detectProviderFromUrl(videoUrl);
        if (existing.videoAsset) {
          // Replace video in place — keeps the same asset id
          await db.videoAsset.update({
            where: { id: existing.videoAsset.id },
            data: { provider: detected.provider, reference: detected.reference },
          });
        } else {
          const asset = await db.videoAsset.create({
            data: {
              title: body.title ?? existing.title,
              provider: detected.provider,
              reference: detected.reference,
            },
          });
          videoAssetId = asset.id;
        }
      }
    }

    const lesson = await db.lesson.update({ where: { id }, data: { ...rest, videoAssetId } });
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
    const lesson = await db.lesson.findUnique({ where: { id } });
    if (!lesson) return apiError(404, "Lesson not found");
    await db.lesson.delete({ where: { id } });
    await audit({ actorId: user.id, action: "lesson.delete", entityType: "lesson", entityId: id, details: { title: lesson.title } });
    return json({ ok: true });
  });
}
