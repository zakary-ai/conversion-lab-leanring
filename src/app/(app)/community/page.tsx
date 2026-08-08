import { Icons } from "@/components/ui/icons";

export const metadata = { title: "Community" };

export default function CommunityIndexPage() {
  return (
    <div className="hidden lg:flex card flex-1 items-center justify-center">
      <div className="text-center px-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-overlay border border-edge text-ink-dim">
          <Icons.community className="h-6 w-6" />
        </div>
        <p className="font-semibold">Welcome to the community</p>
        <p className="text-sm text-ink-mid mt-1 max-w-xs">
          Pick a channel to share wins, ask questions, and sharpen your skills with other members.
        </p>
      </div>
    </div>
  );
}
