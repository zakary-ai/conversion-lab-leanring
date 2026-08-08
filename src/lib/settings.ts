import { db } from "./db";

/**
 * Admin-configurable platform settings. Stored as key/value JSON rows so
 * business rules never live in source code. Defaults below are only used
 * until an admin saves a value.
 */
export const SETTING_DEFAULTS = {
  // Progression
  "progression.jobBoardMinStars": 3,
  "progression.defaultQuizPassingScore": 80,
  "progression.allowStarDeduction": true,
  "progression.starLabel": "Star",
  "progression.starLabelPlural": "Stars",
  // Community
  "community.learnersCanPost": true,
  "community.learnersCanDm": true,
  // Training
  "training.completionRule": "manual", // manual = learner clicks Complete; future: watch-percentage
  "training.defaultAllowQuizRetry": true,
  // Platform
  "platform.name": "Conversion Lab",
  "platform.logoUrl": "",
  "platform.accentColor": "#f59e0b",
  "platform.supportEmail": "support@conversionlab.io",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(
  key: K
): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const row = await db.platformSetting.findUnique({ where: { key } });
  if (!row) return SETTING_DEFAULTS[key];
  return row.value as (typeof SETTING_DEFAULTS)[K];
}

export async function getSettings(): Promise<Record<SettingKey, unknown>> {
  const rows = await db.platformSetting.findMany();
  const map = { ...SETTING_DEFAULTS } as Record<SettingKey, unknown>;
  for (const row of rows) {
    if (row.key in map) map[row.key as SettingKey] = row.value;
  }
  return map;
}

export async function setSetting(key: SettingKey, value: unknown) {
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}
