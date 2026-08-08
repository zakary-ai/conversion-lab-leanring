import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StarIcon, StarRow } from "@/components/ui/Star";

const UNLOCKS = [
  { stars: 1, label: "Sales Script Vault & premium resources" },
  { stars: 2, label: "Advanced training modules" },
  { stars: 3, label: "Job Board with vetted sales opportunities" },
  { stars: 4, label: "Private elite community" },
  { stars: 5, label: "High-level closing roles" },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-dvh flex flex-col relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(800px 400px at 70% -100px, rgba(246,178,27,0.10), transparent 70%), radial-gradient(600px 400px at 10% 110%, rgba(96,165,250,0.05), transparent 70%)",
        }}
      />
      <header className="relative flex items-center justify-between px-6 md:px-12 py-6">
        <span className="inline-flex items-center gap-2 font-bold tracking-tight text-lg">
          <StarIcon className="h-6 w-6" />
          Conversion Lab
        </span>
        <nav className="flex items-center gap-3">
          <Link href="/signin" className="btn btn-ghost">Sign in</Link>
          <Link href="/signup" className="btn btn-primary">Join the academy</Link>
        </nav>
      </header>

      <main className="relative flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
        <p className="chip chip-accent mb-6 animate-rise">The training ground for serious salespeople</p>
        <h1
          className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl animate-rise"
          style={{ animationDelay: "60ms" }}
        >
          Train. Earn Stars.
          <br />
          <span className="bg-gradient-to-r from-accent-hi to-accent bg-clip-text text-transparent">
            Unlock your career.
          </span>
        </h1>
        <p
          className="text-lg text-ink-mid max-w-xl mt-6 animate-rise"
          style={{ animationDelay: "120ms" }}
        >
          A gamified sales academy where progress is proof. Complete training, pass assessments,
          and unlock advanced coaching, private communities, and real sales opportunities.
        </p>
        <div className="flex items-center gap-4 mt-10 animate-rise" style={{ animationDelay: "180ms" }}>
          <Link href="/signup" className="btn btn-primary text-base px-8 py-3">
            Start training free
          </Link>
          <Link href="/signin" className="btn btn-secondary text-base px-6 py-3">
            Sign in
          </Link>
        </div>

        <div className="card mt-16 p-8 max-w-lg w-full text-left animate-rise" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center justify-between mb-6">
            <p className="section-title">Your progression</p>
            <StarRow earned={2} total={5} size="sm" />
          </div>
          <ul className="space-y-4">
            {UNLOCKS.map((u) => (
              <li key={u.stars} className="flex items-center gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 border border-accent/25 text-accent-hi text-sm font-bold">
                  {u.stars}
                </span>
                <span className="text-sm text-ink-mid">{u.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <footer className="relative text-center text-xs text-ink-dim py-8">
        Conversion Lab — where serious salespeople train.
      </footer>
    </div>
  );
}
