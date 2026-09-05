import { z } from "zod";
import { withRole, json, apiError } from "@/lib/api";
import { MeetingProviderError } from "@/lib/providers/meetings";
import { deleteZoomConnection, getZoomConnection, saveZoomConnection } from "@/lib/zoom-connections";

/**
 * The signed-in staff member's own Zoom credentials. The client secret is
 * write-only: it is verified against Zoom, encrypted, and never returned.
 */

const schema = z.object({
  accountId: z.string().trim().min(1, "Enter the account ID").max(200),
  clientId: z.string().trim().min(1, "Enter the client ID").max(200),
  // Empty on re-save keeps the stored secret
  clientSecret: z.string().trim().max(500).optional().default(""),
  zoomUserId: z.string().trim().min(1, "Enter the email of the Zoom user meetings are created under").max(200),
});

export async function GET() {
  return withRole("MODERATOR", async (user) => json({ connection: await getZoomConnection(user.id) }));
}

export async function PUT(req: Request) {
  return withRole("MODERATOR", async (user) => {
    const body = schema.parse(await req.json().catch(() => ({})));
    try {
      const connection = await saveZoomConnection(user.id, body);
      return json({ connection });
    } catch (err) {
      if (err instanceof MeetingProviderError) return apiError(400, err.message);
      // fetch() throws TypeError when Zoom can't be reached at all
      if (err instanceof TypeError) return apiError(502, "Couldn't reach Zoom. Check your connection and try again.");
      throw err;
    }
  });
}

export async function DELETE() {
  return withRole("MODERATOR", async (user) => {
    const removed = await deleteZoomConnection(user.id);
    return json({ ok: true, removed });
  });
}
