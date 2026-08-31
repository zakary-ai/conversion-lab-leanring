import { z } from "zod";
import { db } from "@/lib/db";
import { withRole, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { detectProviderFromUrl } from "@/lib/providers/video";

const schema = z.object({
  moduleId: z.string(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional(),
  type: z.enum(["VIDEO", "TEXT", "DOCUMENT", "LINK"]).default("VIDEO"),
  videoUrl: z.string().trim().url().optional(),
  // Storage key of a video uploaded via /api/admin/uploads; wins over videoUrl
  videoKey: z.string().trim().regex(/^videos\/[\w.\-]+$/).optional(),
  content: z.string().trim().max(20000).optional(),
  fileUrl: z.string().trim().url().optional(),
  linkUrl: z.string().trim().url().optional(),
  durationMin: z.number().int().min(0).max(600).nullable().optional(),
  required: z.boolean().optional(),
});

export async function POST(req: Request) {
  return withRole("ADMIN", async (user) => {
    const body = schema.parse(await req.json());
    const { videoUrl, videoKey, ...rest } = body;

    let videoAssetId: string | undefined;
    if (body.type === "VIDEO" && (videoKey || videoUrl)) {
      const detected = videoKey
        ? { provider: "file", reference: videoKey }
        : detectProviderFromUrl(videoUrl!);
      const asset = await db.videoAsset.create({
        data: { title: body.title, provider: detected.provider, reference: detected.reference },
      });
      videoAssetId = asset.id;
    }

    const count = await db.lesson.count({ where: { moduleId: body.moduleId } });
    const lesson = await db.lesson.create({
      data: { ...rest, videoAssetId, sortOrder: count },
    });
    await audit({ actorId: user.id, action: "lesson.create", entityType: "lesson", entityId: lesson.id, details: { title: lesson.title } });
    return json({ lesson });
  });
}
