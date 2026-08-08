import Link from "next/link";
import { StarIcon } from "@/components/ui/Star";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <StarIcon className="h-12 w-12 opacity-40" filled={false} />
      <h1 className="text-4xl font-bold tracking-tight mt-6">404</h1>
      <p className="text-ink-mid mt-2 max-w-sm">
        This page doesn&apos;t exist — or it hasn&apos;t been unlocked for you yet.
      </p>
      <Link href="/dashboard" className="btn btn-primary mt-8">
        Back to your dashboard
      </Link>
    </div>
  );
}
