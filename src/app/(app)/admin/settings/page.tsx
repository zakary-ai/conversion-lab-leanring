import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/admin/settings/SettingsForm";

export const metadata = { title: "Admin · Settings" };

export default async function AdminSettingsPage() {
  await requireRole("ADMIN");
  const settings = await getSettings();
  return <SettingsForm settings={settings as Record<string, string | number | boolean>} />;
}
