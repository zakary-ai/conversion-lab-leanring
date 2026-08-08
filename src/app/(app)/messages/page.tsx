import { ConversationList } from "@/components/messages/ConversationList";
import { Icons } from "@/components/ui/icons";

export const metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <>
      <ConversationList />
      <div className="hidden lg:flex card flex-1 items-center justify-center">
        <div className="text-center px-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-overlay border border-edge text-ink-dim">
            <Icons.messages className="h-6 w-6" />
          </div>
          <p className="font-semibold">Your messages</p>
          <p className="text-sm text-ink-mid mt-1 max-w-xs">
            Select a conversation or start a new one with another member.
          </p>
        </div>
      </div>
    </>
  );
}
