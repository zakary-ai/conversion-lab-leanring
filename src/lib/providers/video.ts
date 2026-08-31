/**
 * Video hosting provider abstraction.
 *
 * A VideoAsset row stores { provider, reference }. Resolution to a playable
 * source happens here, so swapping the hosting provider (e.g. to Mux or
 * Cloudflare Stream) means adding a resolver — the LMS never changes.
 *
 * Built-in providers:
 *  - "youtube" / "vimeo": reference is the external video URL or id → embed
 *  - "url":  reference is a direct media URL (mp4/HLS) → native <video>
 *  - "file": reference is an object-storage key served via /api/files
 */

export type ResolvedVideo =
  | { kind: "embed"; src: string }
  | { kind: "native"; src: string }
  | { kind: "unavailable"; message: string };

export function resolveVideo(asset: { provider: string; reference: string }): ResolvedVideo {
  switch (asset.provider) {
    case "youtube": {
      const id = extractYouTubeId(asset.reference);
      if (!id) return { kind: "unavailable", message: "Invalid YouTube reference" };
      return { kind: "embed", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` };
    }
    case "vimeo": {
      const id = asset.reference.match(/(\d{6,})/)?.[1];
      if (!id) return { kind: "unavailable", message: "Invalid Vimeo reference" };
      return { kind: "embed", src: `https://player.vimeo.com/video/${id}` };
    }
    case "url":
      return { kind: "native", src: asset.reference };
    case "file":
      // Keys are multi-segment (e.g. "videos/ab12-clip.mp4") — encode each
      // segment so the /api/files/[...key] catch-all sees the segments.
      return { kind: "native", src: `/api/files/${asset.reference.split("/").map(encodeURIComponent).join("/")}` };
    default:
      return {
        kind: "unavailable",
        message: `Video provider "${asset.provider}" is not configured. Add a resolver in src/lib/providers/video.ts.`,
      };
  }
}

function extractYouTubeId(ref: string): string | null {
  if (/^[\w-]{11}$/.test(ref)) return ref;
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = ref.match(p);
    if (m) return m[1];
  }
  return null;
}

export function detectProviderFromUrl(url: string): { provider: string; reference: string } {
  if (/youtube\.com|youtu\.be/.test(url)) return { provider: "youtube", reference: url };
  if (/vimeo\.com/.test(url)) return { provider: "vimeo", reference: url };
  return { provider: "url", reference: url };
}
