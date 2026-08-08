import { z } from "zod";
import { withRole, json, apiError } from "@/lib/api";
import { getSettings, setSetting, SETTING_DEFAULTS, type SettingKey } from "@/lib/settings";
import { audit } from "@/lib/audit";

export async function GET() {
  return withRole("ADMIN", async () => json({ settings: await getSettings() }));
}

export async function PUT(req: Request) {
  return withRole("ADMIN", async (user) => {
    const body = z.record(z.string(), z.unknown()).parse(await req.json());
    const changed: string[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (!(key in SETTING_DEFAULTS)) return apiError(400, `Unknown setting: ${key}`);
      const expected = typeof SETTING_DEFAULTS[key as SettingKey];
      if (typeof value !== expected) return apiError(400, `${key} must be a ${expected}`);
      await setSetting(key as SettingKey, value);
      changed.push(key);
    }
    await audit({
      actorId: user.id,
      action: "settings.updated",
      entityType: "settings",
      details: { keys: changed },
    });
    return json({ ok: true });
  });
}
