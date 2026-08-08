import Link from "next/link";
import { StarIcon } from "@/components/ui/Star";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(600px 300px at 50% -50px, rgba(246,178,27,0.08), transparent 70%)",
        }}
      />
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2 font-bold tracking-tight text-lg">
          <StarIcon className="h-6 w-6" />
          Conversion Lab
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md animate-rise">{children}</div>
      </main>
    </div>
  );
}
