import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WelcomeFlow } from "@/components/onboarding/WelcomeFlow";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return <WelcomeFlow name={user.name} timezone={user.timezone} />;
}
