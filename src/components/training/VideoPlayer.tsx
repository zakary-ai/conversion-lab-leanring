import { resolveVideo } from "@/lib/providers/video";

/**
 * Premium lesson video player. Resolution goes through the video provider
 * abstraction, so the hosting backend can change without touching the LMS.
 */
export function VideoPlayer({
  asset,
}: {
  asset: { provider: string; reference: string; thumbnailUrl?: string | null; title: string };
}) {
  const resolved = resolveVideo(asset);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-edge bg-black shadow-2xl shadow-black/40">
      {resolved.kind === "embed" && (
        <iframe
          src={resolved.src}
          title={asset.title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      )}
      {resolved.kind === "native" && (
        <video
          src={resolved.src}
          poster={asset.thumbnailUrl ?? undefined}
          controls
          playsInline
          className="absolute inset-0 h-full w-full"
        />
      )}
      {resolved.kind === "unavailable" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
          <span className="text-3xl">🎬</span>
          <p className="font-semibold">Video unavailable</p>
          <p className="text-sm text-ink-mid max-w-sm">{resolved.message}</p>
        </div>
      )}
    </div>
  );
}
