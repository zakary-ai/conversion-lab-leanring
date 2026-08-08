import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) redirect("/dashboard");
  return <>{children}</>;
}
